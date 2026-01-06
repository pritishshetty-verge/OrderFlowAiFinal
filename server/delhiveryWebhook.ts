import type { Request, Response } from 'express';
import { storage } from './storage';

interface DelhiveryDefaultPayload {
  Shipment: {
    Status: {
      Status: string;
      StatusDateTime: string;
      StatusLocation: string;
      Instructions?: string;
    };
    AWB: string;
    ReferenceNo?: string;
    OrderType?: string;
  };
}

interface DelhiveryLegacyPayload {
  Awb?: string;
  waybill?: string;
  awb?: string;
  ScanCode?: string;
  StatusCode?: string;
  status_code?: string;
  Scan?: string;
  Status?: string;
  status?: string;
  Remarks?: string;
  remarks?: string;
  Instructions?: string;
  ScanDateTime?: string;
  StatusDateTime?: string;
  scan_datetime?: string;
}

function verifyDelhiveryToken(
  token: string | undefined,
  secret: string
): boolean {
  if (!token) {
    console.warn('[Delhivery Webhook] No token provided in x-delhivery-token header');
    return false;
  }

  return token === secret;
}

function extractPayloadFields(body: any): {
  awb: string | undefined;
  status: string | undefined;
  statusCode: string | undefined;
  remarks: string | undefined;
  statusDateTime: string | undefined;
} {
  if (body.Shipment && body.Shipment.AWB) {
    return {
      awb: body.Shipment.AWB,
      status: body.Shipment.Status?.Status,
      statusCode: undefined,
      remarks: body.Shipment.Status?.Instructions,
      statusDateTime: body.Shipment.Status?.StatusDateTime,
    };
  }

  return {
    awb: body.Awb || body.waybill || body.awb,
    status: body.Scan || body.Status || body.status,
    statusCode: body.ScanCode || body.StatusCode || body.status_code,
    remarks: body.Remarks || body.remarks || body.Instructions || '',
    statusDateTime: body.ScanDateTime || body.StatusDateTime || body.scan_datetime,
  };
}

export async function handleDelhiveryWebhook(req: Request, res: Response) {
  const startTime = Date.now();
  
  try {
    console.log('[Delhivery Webhook] Received webhook:', {
      headers: {
        'x-delhivery-token': req.headers['x-delhivery-token'] ? '[PRESENT]' : '[MISSING]',
        'content-type': req.headers['content-type'],
      },
      body: JSON.stringify(req.body).substring(0, 500),
    });

    const delhiveryWebhookSecret = process.env.DELHIVERY_WEBHOOK_SECRET || process.env.DELHIVERY_API_TOKEN;
    
    if (!delhiveryWebhookSecret) {
      console.error('[Delhivery Webhook] No webhook secret configured (DELHIVERY_WEBHOOK_SECRET or DELHIVERY_API_TOKEN)');
      return res.status(200).json({ success: false, error: 'Webhook secret not configured' });
    }

    const token = req.headers['x-delhivery-token'] as string;

    if (!verifyDelhiveryToken(token, delhiveryWebhookSecret)) {
      console.error('[Delhivery Webhook] Invalid or missing token');
      return res.status(200).json({ success: false, error: 'Invalid token' });
    }

    console.log('[Delhivery Webhook] Token verified successfully');

    const { awb, status, statusCode, remarks, statusDateTime } = extractPayloadFields(req.body);

    if (!awb) {
      console.error('[Delhivery Webhook] No AWB found in payload');
      return res.status(200).json({ success: false, error: 'No AWB found in payload' });
    }

    const effectiveStatus = status || statusCode || '';
    
    if (!effectiveStatus) {
      console.log(`[Delhivery Webhook] Ignoring event with no status for AWB ${awb}`);
      return res.status(200).json({ success: true, message: 'No status to process' });
    }

    // Primary lookup: Find order by tracking_number in orders table
    let order = await storage.getOrderByTrackingNumber(awb);
    let shipment = null;
    
    // Fallback: Try shipments table if order not found by tracking number
    if (!order) {
      shipment = await storage.getShipmentByAWB(awb);
      if (shipment) {
        order = await storage.getOrder(shipment.orderId);
      }
    }
    
    if (!order) {
      console.warn(`[Delhivery Webhook] Order not found for AWB: ${awb}`);
      return res.status(200).json({ success: false, error: 'Order not found for AWB' });
    }

    console.log(`[Delhivery Webhook] Found order ${order.id} for AWB ${awb}`);

    const { delhiveryService } = await import('./services/delhivery');

    // Detect event type BEFORE creating shipment to set correct initial status
    const isNDRByCode = statusCode && delhiveryService.isNDRStatus(statusCode);
    
    const ndrStatusPatterns = [
      'undelivered',
      'ndr',
      'non delivery',
      'customer unavailable',
      'address issue',
      'refused',
      'incomplete address',
      'contact customer',
      'ofd - undelivered',
    ];

    const isNDRByStatus = ndrStatusPatterns.some(pattern => 
      effectiveStatus.toLowerCase().includes(pattern.toLowerCase())
    );

    const isNDR = isNDRByCode || isNDRByStatus;

    const rtoPatterns = ['rto', 'return to origin', 'returned', 'rto in-transit', 'rto delivered'];
    const isRTO = rtoPatterns.some(pattern =>
      effectiveStatus.toLowerCase().includes(pattern.toLowerCase())
    );

    const deliveredPatterns = ['delivered', 'delivery completed', 'shipment delivered'];
    const isDelivered = deliveredPatterns.some(pattern =>
      effectiveStatus.toLowerCase().includes(pattern.toLowerCase())
    ) && !isRTO;

    // Determine initial shipment status based on event type
    const determineShipmentStatus = (): string => {
      if (isRTO) return 'rto';
      if (isNDR) return 'ndr';
      if (isDelivered) return 'delivered';
      return 'in_transit';
    };

    // Check if shipment exists for this order, if not - create one on the fly
    if (!shipment) {
      shipment = await storage.getShipmentByOrderId(order.id);
    }
    
    let shipmentJustCreated = false;
    
    if (!shipment) {
      console.log(`[Delhivery Webhook] No shipment record found for order ${order.id}, creating one on the fly`);
      
      const initialStatus = determineShipmentStatus();
      
      // Create shipment record with correct initial status based on event type
      shipment = await storage.createShipment({
        orderId: order.id,
        shopifyOrderId: order.shopifyOrderId,
        awb: awb,
        courierName: 'Delhivery',
        status: initialStatus,
        currentStatus: effectiveStatus,
        statusUpdatedAt: new Date(),
        trackingUrl: order.trackingUrl || `https://www.delhivery.com/track/package/${awb}`,
        deliveredAt: isDelivered ? new Date() : undefined,
      });
      
      shipmentJustCreated = true;
      console.log(`[Delhivery Webhook] Created shipment ${shipment.id} for order ${order.id} with AWB ${awb}, status: ${initialStatus}`);
    } else {
      // Update existing shipment status
      await storage.updateShipment(shipment.id, {
        currentStatus: effectiveStatus,
        statusUpdatedAt: new Date(),
      });
    }
    
    // Update order's shipment status
    await storage.updateOrder(order.id, {
      shipmentStatus: effectiveStatus,
    });

    if (isNDR || isRTO) {
      console.log('[Delhivery Webhook] NDR/RTO event detected:', {
        awb,
        status: effectiveStatus,
        isNDR,
        isRTO,
        isNDRByCode,
      });

      let ndrStatusValue = 'other';
      
      if (statusCode && delhiveryService.isNDRStatus(statusCode)) {
        ndrStatusValue = delhiveryService.mapNDRStatus(statusCode);
      } else {
        const statusLower = effectiveStatus.toLowerCase();
        if (statusLower.includes('customer unavailable') || statusLower.includes('not available')) {
          ndrStatusValue = 'customer_unavailable';
        } else if (statusLower.includes('address') || statusLower.includes('incomplete')) {
          ndrStatusValue = 'address_issue';
        } else if (statusLower.includes('refused') || statusLower.includes('reject')) {
          ndrStatusValue = 'refused';
        } else if (isRTO) {
          ndrStatusValue = 'rto';
        }
      }

      // Create NDR event - shipment is guaranteed to exist (created on the fly if missing)
      await storage.createNDREvent({
        shipmentId: shipment.id,
        orderId: order.id,
        awb,
        ndrStatus: ndrStatusValue,
        ndrReason: remarks || effectiveStatus,
        ndrDate: statusDateTime ? new Date(statusDateTime) : new Date(),
        rawNdrData: req.body,
      });
      
      console.log(`[Delhivery Webhook] NDR event created for AWB ${awb}`);

      const shipmentStatusLabel = isRTO ? 'RTO' : 'NDR';

      await storage.updateOrder(order.id, {
        status: 'ndr',
        shipmentStatus: shipmentStatusLabel,
      });

      await storage.updateShipment(shipment.id, {
        status: isRTO ? 'rto' : 'ndr',
      });
      
      if (order.assignedTo) {
        await storage.createNotification({
          userId: order.assignedTo,
          orderId: order.id,
          type: 'ndr_alert',
          title: isRTO ? 'RTO Alert: Return to Origin' : 'NDR Alert: Failed Delivery',
          message: `Order #${order.shopifyOrderNumber} has a delivery issue: ${remarks || effectiveStatus}. AWB: ${awb}`,
          actionUrl: `/orders?orderId=${order.id}`,
        });

        console.log('[Delhivery Webhook] NDR notification created for agent:', order.assignedTo);
      }
    }

    // Handle delivered status (skip if shipment was just created with correct status)
    if (isDelivered && !shipmentJustCreated) {
      console.log('[Delhivery Webhook] Delivery completed:', awb);
      
      await storage.updateShipment(shipment.id, {
        status: 'delivered',
        deliveredAt: statusDateTime ? new Date(statusDateTime) : new Date(),
      });

      await storage.updateOrder(order.id, {
        status: 'delivered',
        shipmentStatus: 'Delivered',
      });
    } else if (isDelivered && shipmentJustCreated) {
      // Shipment was created with delivered status, just update order
      await storage.updateOrder(order.id, {
        status: 'delivered',
        shipmentStatus: 'Delivered',
      });
    }

    const transitPatterns = ['in transit', 'in-transit', 'dispatched', 'manifested', 'picked up', 'out for delivery', 'ofd'];
    const isInTransit = transitPatterns.some(pattern =>
      effectiveStatus.toLowerCase().includes(pattern.toLowerCase())
    );

    // Handle transit status (skip if shipment was just created with correct status)
    if (isInTransit && !isNDR && !isRTO && !isDelivered && !shipmentJustCreated) {
      await storage.updateShipment(shipment.id, {
        status: 'in_transit',
      });

      await storage.updateOrder(order.id, {
        shipmentStatus: effectiveStatus,
      });
    }

    const elapsedTime = Date.now() - startTime;
    console.log('[Delhivery Webhook] Webhook processed successfully:', {
      awb,
      status: effectiveStatus,
      isNDR,
      isRTO,
      isDelivered,
      isInTransit,
      elapsedMs: elapsedTime,
    });

    res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error: any) {
    const elapsedTime = Date.now() - startTime;
    console.error('[Delhivery Webhook] Error processing webhook:', error, { elapsedMs: elapsedTime });
    res.status(200).json({ success: false, error: 'Failed to process webhook' });
  }
}

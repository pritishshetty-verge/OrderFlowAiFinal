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

    const shipment = await storage.getShipmentByAWB(awb);
    if (!shipment) {
      console.warn(`[Delhivery Webhook] Shipment not found for AWB: ${awb}`);
      return res.status(200).json({ success: false, error: 'Shipment not found' });
    }

    await storage.updateShipment(shipment.id, {
      currentStatus: effectiveStatus,
      statusUpdatedAt: new Date(),
    });

    const { delhiveryService } = await import('./services/delhivery');

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

      await storage.createNDREvent({
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        awb,
        ndrStatus: ndrStatusValue,
        ndrReason: remarks || effectiveStatus,
        ndrDate: statusDateTime ? new Date(statusDateTime) : new Date(),
        rawNdrData: req.body,
      });

      const shipmentStatusLabel = isRTO ? 'RTO' : 'NDR';

      await storage.updateOrder(shipment.orderId, {
        status: 'ndr',
        shipmentStatus: shipmentStatusLabel,
      });

      await storage.updateShipment(shipment.id, {
        status: isRTO ? 'rto' : 'ndr',
      });

      const order = await storage.getOrder(shipment.orderId);
      
      if (order && order.assignedTo) {
        await storage.createNotification({
          userId: order.assignedTo,
          orderId: shipment.orderId,
          type: 'ndr_alert',
          title: isRTO ? 'RTO Alert: Return to Origin' : 'NDR Alert: Failed Delivery',
          message: `Order #${order.shopifyOrderNumber} has a delivery issue: ${remarks || effectiveStatus}. AWB: ${awb}`,
          actionUrl: `/orders?orderId=${shipment.orderId}`,
        });

        console.log('[Delhivery Webhook] NDR notification created for agent:', order.assignedTo);
      }
    }

    const deliveredPatterns = ['delivered', 'delivery completed', 'shipment delivered'];
    const isDelivered = deliveredPatterns.some(pattern =>
      effectiveStatus.toLowerCase().includes(pattern.toLowerCase())
    );

    if (isDelivered && !isRTO) {
      console.log('[Delhivery Webhook] Delivery completed:', awb);
      
      await storage.updateShipment(shipment.id, {
        status: 'delivered',
        deliveredAt: statusDateTime ? new Date(statusDateTime) : new Date(),
      });

      await storage.updateOrder(shipment.orderId, {
        status: 'delivered',
        shipmentStatus: 'Delivered',
      });
    }

    const transitPatterns = ['in transit', 'in-transit', 'dispatched', 'manifested', 'picked up', 'out for delivery', 'ofd'];
    const isInTransit = transitPatterns.some(pattern =>
      effectiveStatus.toLowerCase().includes(pattern.toLowerCase())
    );

    if (isInTransit && !isNDR && !isRTO && !isDelivered) {
      await storage.updateShipment(shipment.id, {
        status: 'in_transit',
      });

      await storage.updateOrder(shipment.orderId, {
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

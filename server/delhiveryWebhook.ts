import type { Request, Response } from 'express';
import { storage } from './storage';

interface DelhiveryDefaultPayload {
  Shipment: {
    Status: {
      Status: string;
      StatusDateTime: string;
      StatusLocation: string;
      Instructions?: string;
      NSLCode?: string; // NDR code (e.g., "EOD-6", "EOD-74")
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
  nslCode: string | undefined;
  statusType: string | undefined;
} {
  // Priority order for NDR reasons (most specific first):
  // 1. payload.Status.Instructions (contains "Consignee refused..." etc.)
  // 2. payload.Status.Remarks
  // 3. scans[0].Instructions or scans[0].remark
  // 4. Top-level Instructions/Remarks fields
  // 5. FALLBACK: Only use generic Status if above are empty/useless (UD, RTO, etc.)
  
  const isGenericStatus = (val: string | undefined): boolean => {
    if (!val) return true;
    const generic = ['ud', 'rto', 'ndr', 'return accepted', 'undelivered', 'in transit'];
    return generic.some(g => val.toLowerCase().trim() === g || val.toLowerCase().includes('return accepted'));
  };
  
  let extractedRemarks = '';
  
  // Check for scans array with remark/Instructions field (Delhivery One format)
  if (body.scans && Array.isArray(body.scans) && body.scans.length > 0) {
    // Get the first scan's remark/Instructions (usually most relevant for NDR)
    const firstScan = body.scans[0];
    const scanRemark = firstScan.Instructions || firstScan.instructions || 
                       firstScan.remark || firstScan.Remark || '';
    if (scanRemark && !isGenericStatus(scanRemark)) {
      extractedRemarks = scanRemark;
    }
  }
  
  if (body.Shipment && body.Shipment.AWB) {
    // Default format - check Instructions first, then Remarks
    const statusInstructions = body.Shipment.Status?.Instructions;
    const statusRemarks = body.Shipment.Status?.Remarks;
    const shipmentRemarks = body.Shipment.Remarks;
    
    // Priority: Instructions > Remarks > scans > fallback to Status
    let finalRemarks = '';
    if (statusInstructions && !isGenericStatus(statusInstructions)) {
      finalRemarks = statusInstructions;
    } else if (statusRemarks && !isGenericStatus(statusRemarks)) {
      finalRemarks = statusRemarks;
    } else if (shipmentRemarks && !isGenericStatus(shipmentRemarks)) {
      finalRemarks = shipmentRemarks;
    } else if (extractedRemarks) {
      finalRemarks = extractedRemarks;
    } else {
      // Fallback to Status only if nothing else is available
      finalRemarks = body.Shipment.Status?.Status || '';
    }
    
    return {
      awb: body.Shipment.AWB,
      status: body.Shipment.Status?.Status,
      statusCode: undefined,
      remarks: finalRemarks,
      statusDateTime: body.Shipment.Status?.StatusDateTime,
      nslCode: body.Shipment.Status?.NSLCode,
      statusType: body.Shipment.Status?.StatusType,
    };
  }

  // Legacy/alternative format - prioritize specific reason fields
  const instructionsField = body.Instructions || body.instructions;
  const remarksField = body.Remarks || body.remarks;
  const ndrReason = body.ndr_reason || body.NDRReason;
  
  // Priority: Instructions > Remarks > ndr_reason > scans > fallback
  let legacyRemarks = '';
  if (instructionsField && !isGenericStatus(instructionsField)) {
    legacyRemarks = instructionsField;
  } else if (remarksField && !isGenericStatus(remarksField)) {
    legacyRemarks = remarksField;
  } else if (ndrReason && !isGenericStatus(ndrReason)) {
    legacyRemarks = ndrReason;
  } else if (extractedRemarks) {
    legacyRemarks = extractedRemarks;
  } else {
    legacyRemarks = body.Scan || body.Status || body.status || '';
  }
  
  return {
    awb: body.Awb || body.waybill || body.awb,
    status: body.Scan || body.Status || body.status,
    statusCode: body.ScanCode || body.StatusCode || body.status_code,
    remarks: legacyRemarks,
    statusDateTime: body.ScanDateTime || body.StatusDateTime || body.scan_datetime,
    nslCode: body.NSLCode || body.nslCode || body.nsl_code,
    statusType: body.StatusType || body.status_type,
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

    const { awb, status, statusCode, remarks, statusDateTime, nslCode, statusType } = extractPayloadFields(req.body);

    if (!awb) {
      console.error('[Delhivery Webhook] No AWB found in payload');
      return res.status(200).json({ success: false, error: 'No AWB found in payload' });
    }

    // Extract Instructions field for OFD detection
    // Delhivery sends Status: "Dispatched" but Instructions: "Out for delivery"
    const rawInstructions = 
      req.body.Shipment?.Status?.Instructions || 
      req.body.Instructions || 
      req.body.instructions || 
      '';
    
    // Check if Instructions indicates "Out for Delivery" (case-insensitive)
    const isOFDByInstructions = rawInstructions.toLowerCase().includes('out for delivery');
    
    // Determine effective status - prioritize OFD detection over generic "Dispatched"
    let effectiveStatus = status || statusCode || '';
    
    if (isOFDByInstructions && effectiveStatus.toLowerCase() === 'dispatched') {
      console.log(`[Delhivery Webhook] Overriding "Dispatched" → "Out for Delivery" based on Instructions field`);
      effectiveStatus = 'Out for Delivery';
    }
    
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
    const isRTOByStatusType = statusType?.toUpperCase() === 'RT';
    const isRTOByPattern = rtoPatterns.some(pattern =>
      effectiveStatus.toLowerCase().includes(pattern.toLowerCase())
    );
    const isRTO = isRTOByStatusType || isRTOByPattern;

    const deliveredPatterns = ['delivered', 'delivery completed', 'shipment delivered'];
    const isDelivered = deliveredPatterns.some(pattern =>
      effectiveStatus.toLowerCase().includes(pattern.toLowerCase())
    ) && !isRTO;

    // Detect Out for Delivery and In Transit statuses for OFD tab
    const isOutForDelivery = isOFDByInstructions || 
      effectiveStatus.toLowerCase().includes('out for delivery') ||
      effectiveStatus.toLowerCase() === 'ot' ||
      effectiveStatus.toLowerCase() === 'ofd';
    
    const isInTransit = !isOutForDelivery && !isNDR && !isRTO && !isDelivered && (
      effectiveStatus.toLowerCase().includes('in transit') ||
      effectiveStatus.toLowerCase().includes('in-transit') ||
      effectiveStatus.toLowerCase() === 'it' ||
      effectiveStatus.toLowerCase() === 'dispatched'
    );

    // Determine initial shipment status based on event type
    const determineShipmentStatus = (): string => {
      if (isRTO) return 'rto';
      if (isNDR) return 'ndr';
      if (isDelivered) return 'delivered';
      if (isOutForDelivery) return 'out_for_delivery';
      if (isInTransit) return 'in_transit';
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
    
    // Update order's shipment status AND main status for OFD tab visibility
    // For RTO orders, always set shipmentStatus to 'RTO' regardless of status text
    const orderUpdate: Record<string, any> = {
      shipmentStatus: isRTO ? 'RTO' : effectiveStatus,
    };
    
    // Also update main order status for delivery state changes
    if (isRTO) {
      orderUpdate.status = 'rto';
      console.log(`[Delhivery Webhook] Updating order ${order.id} status to rto (StatusType: ${statusType})`);
    } else if (isOutForDelivery) {
      orderUpdate.status = 'out_for_delivery';
      console.log(`[Delhivery Webhook] Updating order ${order.id} status to out_for_delivery`);
    } else if (isInTransit) {
      orderUpdate.status = 'in_transit';
      console.log(`[Delhivery Webhook] Updating order ${order.id} status to in_transit`);
    } else if (isDelivered) {
      orderUpdate.status = 'Delivered';
      console.log(`[Delhivery Webhook] Updating order ${order.id} status to Delivered`);
    }
    
    await storage.updateOrder(order.id, orderUpdate);

    if (isNDR || isRTO) {
      console.log('[Delhivery Webhook] NDR/RTO event detected:', {
        awb,
        status: effectiveStatus,
        statusType,
        isNDR,
        isRTO,
        isRTOByStatusType,
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

      // Update order with NDR details including nslCode, failureReason, lastFailedAt
      await storage.updateOrder(order.id, {
        status: 'ndr',
        shipmentStatus: shipmentStatusLabel,
        nslCode: nslCode || statusCode || null, // Use NSLCode or fallback to statusCode
        failureReason: remarks || effectiveStatus,
        lastFailedAt: statusDateTime ? new Date(statusDateTime) : new Date(),
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

    // Handle transit/OFD status (skip if shipment was just created with correct status)
    if ((isInTransit || isOutForDelivery) && !isNDR && !isRTO && !isDelivered && !shipmentJustCreated) {
      await storage.updateShipment(shipment.id, {
        status: isOutForDelivery ? 'out_for_delivery' : 'in_transit',
      });
    }

    const elapsedTime = Date.now() - startTime;
    console.log('[Delhivery Webhook] Webhook processed successfully:', {
      awb,
      status: effectiveStatus,
      isNDR,
      isRTO,
      isDelivered,
      isOutForDelivery,
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

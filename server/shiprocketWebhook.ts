import type { Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from './storage';
import { toUnifiedStatus } from './logic/unifiedStatus';
import { SHIPPING_STATUS_LABELS } from '@shared/schema';

interface ShiprocketWebhookPayload {
  awb: string;
  order_id: number;
  shipment_id: number;
  courier_name: string;
  current_status: string;
  activities: Array<{
    date: string;
    status: string;
    activity: string;
    location: string;
  }>;
  // NDR specific fields
  ndr_status?: string;
  ndr_status_code?: string;
  comment?: string;
}

/**
 * Verify Shiprocket webhook signature
 * Shiprocket uses X-Shiprocket-Signature header with HMAC-SHA256
 */
function verifyShiprocketSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    console.error('[Shiprocket Webhook] No signature provided');
    return false;
  }

  try {
    // Create HMAC using the webhook secret
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    // Compare signatures using timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('[Shiprocket Webhook] Signature verification error:', error);
    return false;
  }
}

export async function handleShiprocketWebhook(req: Request, res: Response) {
  try {
    console.log('[Shiprocket Webhook] Received webhook:', {
      headers: req.headers,
      body: req.body,
    });

    // Verify webhook signature
    const shiprocketWebhookSecret = process.env.SHIPROCKET_WEBHOOK_SECRET;
    
    if (!shiprocketWebhookSecret) {
      console.error('[Shiprocket Webhook] SHIPROCKET_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const signature = req.headers['x-shiprocket-signature'] as string;
    // Use raw body from express.json middleware to avoid signature mismatches from JSON re-stringification
    const rawBody = req.rawBody ? (req.rawBody as Buffer).toString('utf8') : JSON.stringify(req.body);

    if (!verifyShiprocketSignature(rawBody, signature, shiprocketWebhookSecret)) {
      console.error('[Shiprocket Webhook] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('[Shiprocket Webhook] Signature verified successfully');

    const payload: ShiprocketWebhookPayload = req.body;

    // Validate required fields
    if (!payload.awb || !payload.current_status) {
      console.error('[Shiprocket Webhook] Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get shipment from database
    const shipment = await storage.getShipmentByAWB(payload.awb);
    if (!shipment) {
      console.error('[Shiprocket Webhook] Shipment not found:', payload.awb);
      return res.status(404).json({ error: 'Shipment not found' });
    }

    // Update raw shipment tracking string
    await storage.updateShipment(shipment.id, {
      currentStatus: payload.current_status,
      statusUpdatedAt: new Date(),
      courierName: payload.courier_name || shipment.courierName,
    });

    // Translate Shiprocket's free-text status into our canonical status via
    // the single centralized mapper, then write it to orders.status (the
    // single source of truth). An explicit ndr_status flag always means NDR.
    const unifiedStatus = payload.ndr_status
      ? 'ndr'
      : toUnifiedStatus({ source: 'shiprocket', rawStatus: payload.current_status });

    const isNDR = unifiedStatus === 'ndr';
    const isDelivered = unifiedStatus === 'delivered';
    const isRTO =
      unifiedStatus === 'rto_initiated' ||
      unifiedStatus === 'rto_ofd' ||
      unifiedStatus === 'rto_delivered';

    // Always update the order's canonical status + human-readable breadcrumb.
    await storage.updateOrder(shipment.orderId, {
      status: unifiedStatus,
      shipmentStatus: SHIPPING_STATUS_LABELS[unifiedStatus] || payload.current_status,
    });

    if (isNDR) {
      console.log('[Shiprocket Webhook] NDR event detected:', {
        awb: payload.awb,
        status: payload.current_status,
        ndrStatus: payload.ndr_status,
      });

      // Determine NDR reason
      let ndrStatus = 'other';
      const statusLower = (payload.current_status || '').toLowerCase();

      if (statusLower.includes('customer unavailable') || statusLower.includes('not available')) {
        ndrStatus = 'customer_unavailable';
      } else if (statusLower.includes('address') || statusLower.includes('incomplete')) {
        ndrStatus = 'address_issue';
      } else if (statusLower.includes('refused') || statusLower.includes('reject')) {
        ndrStatus = 'refused';
      }

      // Create NDR event
      await storage.createNDREvent({
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        awb: payload.awb,
        ndrStatus,
        ndrReason: payload.comment || payload.current_status,
        ndrDate: new Date(),
        rawNdrData: payload,
      });

      // Get order to find assigned agent
      const order = await storage.getOrder(shipment.orderId);

      if (order && order.assignedTo) {
        // Create notification for assigned agent
        await storage.createNotification({
          userId: order.assignedTo,
          orderId: shipment.orderId,
          type: 'ndr_alert',
          title: 'NDR Alert: Failed Delivery',
          message: `Order #${order.shopifyOrderNumber} has a delivery issue: ${payload.comment || payload.current_status}. AWB: ${payload.awb}`,
          actionUrl: `/orders?orderId=${shipment.orderId}`,
        });

        console.log('[Shiprocket Webhook] NDR notification created for agent:', order.assignedTo);
      }

      // Update shipment status to NDR
      await storage.updateShipment(shipment.id, {
        status: 'ndr',
      });
    }

    if (isDelivered) {
      console.log('[Shiprocket Webhook] Delivery completed:', payload.awb);

      await storage.updateShipment(shipment.id, {
        status: 'delivered',
        deliveredAt: new Date(),
      });
    }

    if (isRTO) {
      console.log('[Shiprocket Webhook] RTO detected:', payload.awb, unifiedStatus);

      await storage.updateShipment(shipment.id, {
        status: 'rto',
        ...(unifiedStatus === 'rto_delivered' ? { deliveredAt: new Date() } : {}),
      });
    }

    console.log('[Shiprocket Webhook] Webhook processed successfully:', {
      awb: payload.awb,
      status: payload.current_status,
      unifiedStatus,
      isNDR,
      isDelivered,
      isRTO,
    });

    res.json({ success: true, message: 'Webhook processed successfully' });
  } catch (error: any) {
    console.error('[Shiprocket Webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}

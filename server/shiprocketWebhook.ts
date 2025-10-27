import type { Request, Response } from 'express';
import { storage } from './storage';

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

export async function handleShiprocketWebhook(req: Request, res: Response) {
  try {
    console.log('[Shiprocket Webhook] Received webhook:', {
      headers: req.headers,
      body: req.body,
    });

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

    // Update shipment status
    await storage.updateShipment(shipment.id, {
      currentStatus: payload.current_status,
      statusUpdatedAt: new Date(),
      courierName: payload.courier_name || shipment.courierName,
    });

    // Check if this is an NDR event
    const ndrStatuses = [
      'ndr',
      'NDR',
      'non delivery report',
      'customer unavailable',
      'address issue',
      'refused',
      'incomplete address',
    ];

    const isNDR = ndrStatuses.some(status => 
      payload.current_status.toLowerCase().includes(status.toLowerCase())
    ) || payload.ndr_status;

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
      const ndrEvent = await storage.createNDREvent({
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        awb: payload.awb,
        ndrStatus,
        ndrReason: payload.comment || payload.current_status,
        ndrDate: new Date(),
        rawNdrData: payload,
      });

      // Update order status to NDR
      await storage.updateOrder(shipment.orderId, {
        status: 'ndr',
        shipmentStatus: 'NDR',
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

    // Check for delivered status
    const deliveredStatuses = ['delivered', 'delivery completed', 'successful'];
    const isDelivered = deliveredStatuses.some(status =>
      payload.current_status.toLowerCase().includes(status.toLowerCase())
    );

    if (isDelivered) {
      console.log('[Shiprocket Webhook] Delivery completed:', payload.awb);
      
      await storage.updateShipment(shipment.id, {
        status: 'delivered',
        deliveredAt: new Date(),
      });

      await storage.updateOrder(shipment.orderId, {
        status: 'delivered',
        shipmentStatus: 'Delivered',
      });
    }

    // Check for RTO (Return to Origin)
    const rtoStatuses = ['rto', 'return to origin', 'returned'];
    const isRTO = rtoStatuses.some(status =>
      payload.current_status.toLowerCase().includes(status.toLowerCase())
    );

    if (isRTO) {
      console.log('[Shiprocket Webhook] RTO detected:', payload.awb);
      
      await storage.updateShipment(shipment.id, {
        status: 'rto',
      });

      await storage.updateOrder(shipment.orderId, {
        status: 'ndr',
        shipmentStatus: 'RTO',
      });
    }

    console.log('[Shiprocket Webhook] Webhook processed successfully:', {
      awb: payload.awb,
      status: payload.current_status,
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

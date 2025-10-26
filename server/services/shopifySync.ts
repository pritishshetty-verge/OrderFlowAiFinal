import { storage } from "../storage";
import { updateShopifyClient } from "../shopify";
import type { Order, User } from "@shared/schema";

interface SyncContext {
  userId?: string;
  agentName?: string;
  reason?: string;
  notes?: string;
  followupDate?: Date;
}

export class ShopifySyncService {
  /**
   * Syncs order status changes from our app to Shopify.
   * This is async/non-blocking - errors are logged but don't throw.
   * 
   * @param orderId - Internal order ID
   * @param syncType - Type of sync: 'confirmed', 'cancelled', 'followup'
   * @param context - Additional context data (agent info, notes, etc.)
   */
  async syncToShopify(
    orderId: string,
    syncType: 'confirmed' | 'cancelled' | 'followup',
    context: SyncContext
  ): Promise<void> {
    try {
      // Get order from database
      const order = await storage.getOrder(orderId);
      if (!order) {
        console.error(`[Shopify Sync] Order not found: ${orderId}`);
        return;
      }

      if (!order.shopifyOrderId) {
        console.error(`[Shopify Sync] No Shopify order ID for order: ${orderId}`);
        return;
      }

      // Get user info if userId provided
      let user: User | undefined;
      if (context.userId) {
        user = await storage.getUser(context.userId);
      }

      const agentName = context.agentName || user?.fullName || "Agent";

      console.log(`[Shopify Sync] Starting sync for order ${order.shopifyOrderNumber} (${syncType})`);

      // Update Shopify client with latest credentials
      const client = await updateShopifyClient();

      // Execute sync based on type
      switch (syncType) {
        case 'confirmed':
          await this.syncConfirmed(client, order, agentName, context.notes);
          break;
        case 'cancelled':
          await this.syncCancelled(client, order, agentName, context.reason || 'Other', context.notes);
          break;
        case 'followup':
          await this.syncFollowup(client, order, agentName, context.followupDate, context.notes);
          break;
      }

      // Update order sync status
      await storage.updateOrderSyncStatus(orderId, 'synced', new Date());

      console.log(`[Shopify Sync] ✓ Successfully synced order ${order.shopifyOrderNumber} (${syncType})`);
    } catch (error) {
      console.error(`[Shopify Sync] ✗ Failed to sync order ${orderId}:`, error);
      
      // Log error to database
      try {
        const order = await storage.getOrder(orderId);
        if (order) {
          await storage.createSyncLog({
            orderId,
            shopifyOrderId: order.shopifyOrderId,
            syncType,
            syncAction: 'batch_update',
            syncStatus: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            retryCount: 0,
          });

          await storage.updateOrderSyncStatus(orderId, 'failed');
        }
      } catch (logError) {
        console.error(`[Shopify Sync] Failed to log sync error:`, logError);
      }
    }
  }

  /**
   * Sync confirmed order status to Shopify
   */
  private async syncConfirmed(
    client: any,
    order: Order,
    agentName: string,
    notes?: string
  ): Promise<void> {
    const shopifyOrderId = order.shopifyOrderId;
    const actions: Promise<any>[] = [];

    // Log start
    const syncLog = await storage.createSyncLog({
      orderId: order.id,
      shopifyOrderId,
      syncType: 'confirmed',
      syncAction: 'add_tag',
      syncStatus: 'pending',
    });

    try {
      // 1. Add OF:confirmed tag
      const existingTags = order.tags || [];
      const newTags = Array.from(new Set([...existingTags, 'OF:confirmed']));
      actions.push(
        client.updateOrderTags(shopifyOrderId, newTags)
          .then(() => console.log(`[Shopify Sync] Added 'OF:confirmed' tag`))
      );

      // 2. Add note with agent and timestamp
      const timestamp = new Date().toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const noteText = notes 
        ? `Confirmed by ${agentName} • ${timestamp}\n${notes}`
        : `Confirmed by ${agentName} • ${timestamp}`;
      
      actions.push(
        client.addOrderNote(shopifyOrderId, noteText)
          .then(() => console.log(`[Shopify Sync] Added verification note`))
      );

      // 3. Set metafield
      actions.push(
        client.updateMetafield(
          shopifyOrderId,
          'verification_status',
          'confirmed',
          'single_line_text_field'
        ).then(() => console.log(`[Shopify Sync] Set verification metafield`))
      );

      actions.push(
        client.updateMetafield(
          shopifyOrderId,
          'verified_by',
          agentName,
          'single_line_text_field'
        ).then(() => console.log(`[Shopify Sync] Set verified_by metafield`))
      );

      actions.push(
        client.updateMetafield(
          shopifyOrderId,
          'verified_at',
          new Date().toISOString(),
          'date_time'
        ).then(() => console.log(`[Shopify Sync] Set verified_at metafield`))
      );

      // Execute all actions in parallel
      await Promise.all(actions);

      // Update sync log
      await storage.updateSyncLog(syncLog.id, {
        syncStatus: 'success',
        syncedAt: new Date(),
      });
    } catch (error) {
      await storage.updateSyncLog(syncLog.id, {
        syncStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Sync cancelled order status to Shopify
   */
  private async syncCancelled(
    client: any,
    order: Order,
    agentName: string,
    reason: string,
    notes?: string
  ): Promise<void> {
    const shopifyOrderId = order.shopifyOrderId;
    const actions: Promise<any>[] = [];

    const syncLog = await storage.createSyncLog({
      orderId: order.id,
      shopifyOrderId,
      syncType: 'cancelled',
      syncAction: 'cancel_order',
      syncStatus: 'pending',
    });

    try {
      // 1. Add OF:cancelled tag
      const existingTags = order.tags || [];
      const newTags = Array.from(new Set([...existingTags, 'OF:cancelled']));
      actions.push(
        client.updateOrderTags(shopifyOrderId, newTags)
          .then(() => console.log(`[Shopify Sync] Added 'OF:cancelled' tag`))
      );

      // 2. Add cancellation note
      const timestamp = new Date().toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const noteText = notes
        ? `Cancelled by ${agentName} • ${timestamp}\nReason: ${reason}\n${notes}`
        : `Cancelled by ${agentName} • ${timestamp}\nReason: ${reason}`;
      
      actions.push(
        client.addOrderNote(shopifyOrderId, noteText)
          .then(() => console.log(`[Shopify Sync] Added cancellation note`))
      );

      // 3. Cancel order in Shopify (only if unfulfilled)
      if (order.fulfillmentStatus !== 'fulfilled') {
        actions.push(
          client.cancelOrder(shopifyOrderId, reason, false)
            .then(() => console.log(`[Shopify Sync] Cancelled order in Shopify`))
            .catch((err: Error) => {
              // Don't fail entire sync if already cancelled
              if (err.message.includes('already') || err.message.includes('cancel')) {
                console.log(`[Shopify Sync] Order already cancelled in Shopify, skipping`);
              } else {
                throw err;
              }
            })
        );
      } else {
        console.log(`[Shopify Sync] Order already fulfilled, skipping cancellation`);
      }

      // 4. Set metafields
      actions.push(
        client.updateMetafield(
          shopifyOrderId,
          'verification_status',
          'cancelled',
          'single_line_text_field'
        ).then(() => console.log(`[Shopify Sync] Set verification metafield`))
      );

      actions.push(
        client.updateMetafield(
          shopifyOrderId,
          'cancellation_reason',
          reason,
          'single_line_text_field'
        ).then(() => console.log(`[Shopify Sync] Set cancellation_reason metafield`))
      );

      // Execute all actions in parallel
      await Promise.all(actions);

      await storage.updateSyncLog(syncLog.id, {
        syncStatus: 'success',
        syncedAt: new Date(),
      });
    } catch (error) {
      await storage.updateSyncLog(syncLog.id, {
        syncStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Sync follow-up schedule to Shopify
   */
  private async syncFollowup(
    client: any,
    order: Order,
    agentName: string,
    followupDate?: Date,
    notes?: string
  ): Promise<void> {
    const shopifyOrderId = order.shopifyOrderId;
    const actions: Promise<any>[] = [];

    const syncLog = await storage.createSyncLog({
      orderId: order.id,
      shopifyOrderId,
      syncType: 'followup',
      syncAction: 'add_tag',
      syncStatus: 'pending',
    });

    try {
      // 1. Add OF:followup tag
      const existingTags = order.tags || [];
      const newTags = Array.from(new Set([...existingTags, 'OF:followup']));
      actions.push(
        client.updateOrderTags(shopifyOrderId, newTags)
          .then(() => console.log(`[Shopify Sync] Added 'OF:followup' tag`))
      );

      // 2. Add follow-up note
      const followupDateObj = followupDate || order.followupAt || new Date();
      const followupTime = followupDateObj.toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      const noteText = notes
        ? `Follow-up by ${agentName} • ${followupTime}\n${notes}`
        : `Follow-up by ${agentName} • ${followupTime}`;
      
      actions.push(
        client.addOrderNote(shopifyOrderId, noteText)
          .then(() => console.log(`[Shopify Sync] Added follow-up note`))
      );

      // 3. Set metafields
      actions.push(
        client.updateMetafield(
          shopifyOrderId,
          'verification_status',
          'followup_scheduled',
          'single_line_text_field'
        ).then(() => console.log(`[Shopify Sync] Set verification metafield`))
      );

      actions.push(
        client.updateMetafield(
          shopifyOrderId,
          'followup_date',
          followupDateObj.toISOString(),
          'date_time'
        ).then(() => console.log(`[Shopify Sync] Set followup_date metafield`))
      );

      // Execute all actions in parallel
      await Promise.all(actions);

      await storage.updateSyncLog(syncLog.id, {
        syncStatus: 'success',
        syncedAt: new Date(),
      });
    } catch (error) {
      await storage.updateSyncLog(syncLog.id, {
        syncStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export const shopifySyncService = new ShopifySyncService();

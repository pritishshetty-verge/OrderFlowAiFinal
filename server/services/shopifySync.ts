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
   * Retry helper with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    actionName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Shopify Sync] ${actionName} - Attempt ${attempt}/${maxRetries}`);
        const result = await fn();
        console.log(`[Shopify Sync] ✓ ${actionName} succeeded on attempt ${attempt}`);
        return result;
      } catch (error: any) {
        lastError = error;
        const errorDetails = error instanceof Error ? error.message : JSON.stringify(error);
        console.error(`[Shopify Sync] ✗ ${actionName} failed on attempt ${attempt}:`, errorDetails);
        
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          console.log(`[Shopify Sync] Retrying ${actionName} in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Sync cancelled order status to Shopify
   * NOTE: Order is already cancelled via route handler, this only adds tags/notes
   */
  private async syncCancelled(
    client: any,
    order: Order,
    agentName: string,
    reason: string,
    notes?: string
  ): Promise<void> {
    const shopifyOrderId = order.shopifyOrderId;
    const orderNumber = order.shopifyOrderNumber;

    console.log(`[Shopify Sync] ========================================`);
    console.log(`[Shopify Sync] Starting cancellation sync for order #${orderNumber}`);
    console.log(`[Shopify Sync] Order ID: ${order.id}`);
    console.log(`[Shopify Sync] Shopify Order ID: ${shopifyOrderId}`);
    console.log(`[Shopify Sync] Agent: ${agentName}`);
    console.log(`[Shopify Sync] Reason: ${reason}`);
    console.log(`[Shopify Sync] ========================================`);

    const syncLog = await storage.createSyncLog({
      orderId: order.id,
      shopifyOrderId,
      syncType: 'cancelled',
      syncAction: 'add_tags_notes',
      syncStatus: 'pending',
    });

    let retryCount = 0;
    const errors: string[] = [];

    try {
      // 1. Add OF:cancelled tag with retry
      try {
        const existingTags = order.tags || [];
        const newTags = Array.from(new Set([...existingTags, 'OF:cancelled']));
        
        console.log(`[Shopify Sync] Current tags:`, existingTags);
        console.log(`[Shopify Sync] New tags to set:`, newTags);
        
        await this.retryWithBackoff(
          async () => {
            const result = await client.updateOrderTags(shopifyOrderId, newTags);
            console.log(`[Shopify Sync] Tag update response:`, JSON.stringify(result, null, 2));
            return result;
          },
          `Adding 'OF:cancelled' tag to order #${orderNumber}`
        );
      } catch (tagError: any) {
        const errorMsg = `Failed to add tag after 3 retries: ${tagError instanceof Error ? tagError.message : JSON.stringify(tagError)}`;
        console.error(`[Shopify Sync] ✗✗✗ ${errorMsg}`);
        errors.push(errorMsg);
        retryCount++;
      }

      // 2. Add cancellation note with retry
      try {
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
        
        console.log(`[Shopify Sync] Note to add:`, noteText);
        
        await this.retryWithBackoff(
          async () => {
            const result = await client.addOrderNote(shopifyOrderId, noteText);
            console.log(`[Shopify Sync] Note update response:`, JSON.stringify(result, null, 2));
            return result;
          },
          `Adding cancellation note to order #${orderNumber}`
        );
      } catch (noteError: any) {
        const errorMsg = `Failed to add note after 3 retries: ${noteError instanceof Error ? noteError.message : JSON.stringify(noteError)}`;
        console.error(`[Shopify Sync] ✗✗✗ ${errorMsg}`);
        errors.push(errorMsg);
        retryCount++;
      }

      // 3. Set verification_status metafield with retry
      try {
        await this.retryWithBackoff(
          async () => {
            const result = await client.updateMetafield(
              shopifyOrderId,
              'verification_status',
              'cancelled',
              'single_line_text_field'
            );
            console.log(`[Shopify Sync] Verification metafield response:`, JSON.stringify(result, null, 2));
            return result;
          },
          `Setting verification_status metafield for order #${orderNumber}`
        );
      } catch (metaError: any) {
        const errorMsg = `Failed to set verification metafield: ${metaError instanceof Error ? metaError.message : JSON.stringify(metaError)}`;
        console.error(`[Shopify Sync] ✗ ${errorMsg}`);
        errors.push(errorMsg);
      }

      // 4. Set cancellation_reason metafield with retry
      try {
        await this.retryWithBackoff(
          async () => {
            const result = await client.updateMetafield(
              shopifyOrderId,
              'cancellation_reason',
              reason,
              'single_line_text_field'
            );
            console.log(`[Shopify Sync] Cancellation reason metafield response:`, JSON.stringify(result, null, 2));
            return result;
          },
          `Setting cancellation_reason metafield for order #${orderNumber}`
        );
      } catch (metaError: any) {
        const errorMsg = `Failed to set cancellation_reason metafield: ${metaError instanceof Error ? metaError.message : JSON.stringify(metaError)}`;
        console.error(`[Shopify Sync] ✗ ${errorMsg}`);
        errors.push(errorMsg);
      }

      // Determine final status
      if (errors.length === 0) {
        console.log(`[Shopify Sync] ✓✓✓ Sync completed successfully for order #${orderNumber}`);
        await storage.updateSyncLog(syncLog.id, {
          syncStatus: 'success',
          syncedAt: new Date(),
        });
      } else {
        const errorMessage = `Partial sync failure (${errors.length} errors):\n${errors.join('\n')}`;
        console.error(`[Shopify Sync] ✗✗✗ ${errorMessage}`);
        await storage.updateSyncLog(syncLog.id, {
          syncStatus: 'failed',
          errorMessage,
          retryCount,
        });
        throw new Error(errorMessage);
      }
      
      console.log(`[Shopify Sync] ======================================== END`);
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Shopify Sync] ✗✗✗ FATAL ERROR during cancellation sync for order #${orderNumber}:`, errorMessage);
      console.error(`[Shopify Sync] Full error object:`, error);
      
      await storage.updateSyncLog(syncLog.id, {
        syncStatus: 'failed',
        errorMessage,
        retryCount,
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

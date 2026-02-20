import { db } from "../db";
import { webhooks } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export async function triggerWebhooks(eventType: string, payload: any) {
  try {
    const activeWebhooks = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.eventType, eventType), eq(webhooks.isActive, true)));

    if (activeWebhooks.length === 0) return;

    console.log(`[Webhooks] Firing ${activeWebhooks.length} webhook(s) for event: ${eventType}`);

    const results = await Promise.allSettled(
      activeWebhooks.map(async (webhook) => {
        try {
          const response = await fetch(webhook.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: eventType,
              timestamp: new Date().toISOString(),
              data: payload,
            }),
          });
          console.log(`[Webhooks] Sent to ${webhook.url} — status ${response.status}`);
        } catch (error: any) {
          console.error(`[Webhooks] Failed to send to ${webhook.url}:`, error.message);
        }
      })
    );
  } catch (error) {
    console.error("[Webhooks] Engine Error:", error);
  }
}

import { storage } from "../storage";
import { getDelhiveryClient } from "../services/delhivery";

// ─────────────────────────────────────────────────────────────────────
// Fallback poll — closes NDR events whose terminal-status webhook
// never arrived.
//
// Webhook-driven closure (see delhiveryWebhook.ts / shiprocketWebhook.ts)
// covers ~99% of shipments. But couriers occasionally drop a delivered/
// RTO webhook — network blip on their side, our endpoint briefly down,
// their retry logic gave up. When that happens the ndr_events row stays
// open forever and never counts toward NDR Delivery Rate, so agents
// look worse than they actually are on payroll.
//
// This job runs nightly, finds ndr_events rows older than a threshold
// that are still `resolved = false`, calls Delhivery's live tracking
// API to see the real state, and closes each one appropriately.
//
// Cost: ~1 API call per stale row per night. Delhivery's tracking API
// is a cheap GET; even a bad month rarely leaves >100 rows stuck. We
// cap at STALE_LIMIT per run so a data-quality incident can't burn
// through the API quota all at once.
// ─────────────────────────────────────────────────────────────────────

// ndrDate must be older than this to be a poll candidate. 72h gives
// Delhivery ample time to retry the delivered webhook naturally; we
// only intervene when they've clearly given up.
const STALE_HOURS = 72;

// Hard cap per run to protect the courier API quota.
const STALE_LIMIT = 200;

// Ndrs older than this are almost certainly abandoned. Mark as
// `cancelled` so they drop out of the metric denominator instead of
// dragging Delivery Rate down forever. Nothing legitimate takes 45+
// days to reach a terminal state.
const ABANDON_DAYS = 45;

export interface CloseStaleNDRResult {
  scanned: number;
  closedDelivered: number;
  closedReturned: number;
  closedCancelled: number;
  stillOpen: number;
  errors: number;
  errorSamples: string[];
}

export async function closeStaleNDREvents(
  now: Date = new Date(),
): Promise<CloseStaleNDRResult> {
  const result: CloseStaleNDRResult = {
    scanned: 0,
    closedDelivered: 0,
    closedReturned: 0,
    closedCancelled: 0,
    stillOpen: 0,
    errors: 0,
    errorSamples: [],
  };

  const stale = await storage.listStaleUnresolvedNDREvents(STALE_HOURS, STALE_LIMIT);
  result.scanned = stale.length;
  if (!stale.length) return result;

  // Group by AWB so we make one tracking call per shipment even if it
  // has multiple open NDR events (rare, but possible when a shipment
  // failed → NDR → reattempt failed → NDR again).
  const byAwb = new Map<string, { storeId: string | null; ndrDate: Date }>();
  for (const evt of stale) {
    const existing = byAwb.get(evt.awb);
    if (!existing || evt.ndrDate < existing.ndrDate) {
      byAwb.set(evt.awb, { storeId: evt.storeId ?? null, ndrDate: evt.ndrDate });
    }
  }

  const abandonCutoff = new Date(now.getTime() - ABANDON_DAYS * 24 * 60 * 60 * 1000);

  for (const [awb, meta] of Array.from(byAwb.entries())) {
    try {
      // Abandon path: nothing legitimate takes 45+ days. Mark as
      // cancelled so it drops out of the payroll denominator.
      if (meta.ndrDate < abandonCutoff) {
        const closed = await storage.resolveOpenNDREvents(awb, "cancelled", now);
        result.closedCancelled += closed;
        continue;
      }

      if (!meta.storeId) {
        // ndr_events written before we started stamping storeId (rare).
        // We can't build a store-scoped client, and Delhivery creds are
        // per-store, so leave it — the backfill script picks these up.
        result.stillOpen += 1;
        continue;
      }
      let client;
      try {
        client = await getDelhiveryClient(meta.storeId);
      } catch {
        // Store missing / Delhivery not configured for this store.
        // Not fatal — just skip.
        result.stillOpen += 1;
        continue;
      }

      const track = await client.trackShipment(awb);
      if (!track.success) {
        // Not fatal — Delhivery might not have this AWB in their
        // system yet, or the shipment might be too old to look up.
        // Leave it for next run.
        result.stillOpen += 1;
        continue;
      }

      const statusLower = (track.status ?? "").toLowerCase();
      // Delhivery uses "Delivered" for successful delivery and either
      // "RTO" or a status containing "return" for RTO. Anything else
      // means still in flight — skip.
      let resolution: "delivered" | "returned" | null = null;
      if (statusLower === "delivered") {
        resolution = "delivered";
      } else if (statusLower.includes("rto") || statusLower.includes("return")) {
        resolution = "returned";
      }

      if (!resolution) {
        result.stillOpen += 1;
        continue;
      }

      // Find the true terminal timestamp from the scan history when we
      // can — that's when Delhivery says the event actually happened.
      // Falls back to `now` if we can't parse a scan date.
      let terminalAt: Date = now;
      const terminalScan = track.activities?.find((a) => {
        const s = (a.status ?? "").toLowerCase();
        return resolution === "delivered"
          ? s === "delivered"
          : s.includes("rto") || s.includes("return");
      });
      if (terminalScan?.datetime) {
        const parsed = new Date(terminalScan.datetime);
        if (!Number.isNaN(parsed.getTime())) terminalAt = parsed;
      }

      const closed = await storage.resolveOpenNDREvents(awb, resolution, terminalAt);
      if (resolution === "delivered") result.closedDelivered += closed;
      else result.closedReturned += closed;
    } catch (err: any) {
      result.errors += 1;
      if (result.errorSamples.length < 5) {
        result.errorSamples.push(`${awb}: ${err?.message ?? String(err)}`);
      }
    }
  }

  return result;
}

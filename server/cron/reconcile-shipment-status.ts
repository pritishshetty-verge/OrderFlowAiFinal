import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { getDelhiveryClient } from "../services/delhivery";
import { normalizeDelhivery } from "../logic/rules/delhivery";
import { toUnifiedStatus } from "../logic/unifiedStatus";
import { SHIPPING_STATUS_LABELS } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────
// Nightly shipment-status reconciliation.
//
// The Delhivery webhook is our primary status feed — but it drops
// scans occasionally (their retry gives up, our endpoint 5xx'd, a
// scan class we don't yet handle). When that happens the order stays
// pinned at a non-terminal status (out_for_delivery / in_transit /
// ndr) forever. That's not just a UI cosmetic — Chandi's NDR Delivery
// Rate and the Brand TDR feed off orders.status, so drift silently
// wrongs the payroll.
//
// This sweep is the systematic fix. Every run:
//   1. finds in-flight orders that have been quiet for STALE_HOURS
//   2. queries Delhivery's live tracking API for each
//   3. re-normalises through the SAME rules the webhook uses
//   4. writes the corrected status back to orders + shipments +
//      order_status_history when it disagrees
//
// It complements — doesn't replace — the webhook path. Webhooks stay
// near-real-time. This is the safety net for the ~1% they miss.
// ─────────────────────────────────────────────────────────────────────

// Only touch orders quiet for this long. Fresh orders that Delhivery
// is actively pushing scans for should stay out of the sweep — the
// webhook path handles them faster.
const STALE_HOURS = 6;

// Hard cap so a bad run can't burn through Delhivery's tracking quota.
// At 500/run × ~4 runs/day the total headroom is ~2000/day, well under
// their published tracking-API limits.
const BATCH_LIMIT = 500;

// Only shipping statuses that CAN still change. Terminal statuses
// (delivered / rto_delivered / cancelled / lost) are skipped — no
// point re-querying Delhivery for a settled shipment.
const IN_FLIGHT_STATUSES = [
  "awb_assigned",
  "ready_for_pickup",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "ndr",
  "rto_initiated",
  "rto_ofd",
] as const;

export interface ReconcileResult {
  scanned: number;
  updated: number;
  unchanged: number;
  errors: number;
  noAwb: number;
  noClient: number;
  errorSamples: string[];
  transitions: Record<string, number>; // "out_for_delivery→delivered" counts
}

interface Candidate {
  orderId: string;
  storeId: string | null;
  currentStatus: string;
  awb: string | null;
  updatedAt: Date | null;
}

async function pickCandidates(): Promise<Candidate[]> {
  // Pull only what we need. LEFT JOIN shipments — we want the AWB but
  // an order without a shipment row is fine to skip (nothing to query).
  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString();
  const res: any = await db.execute(sql`
    SELECT
      o.id            AS order_id,
      o.store_id      AS store_id,
      o.status        AS current_status,
      o.updated_at    AS updated_at,
      s.awb           AS awb
    FROM orders o
    LEFT JOIN shipments s ON s.order_id = o.id
    WHERE o.status IN (
      'awb_assigned','ready_for_pickup','picked_up','in_transit',
      'out_for_delivery','ndr','rto_initiated','rto_ofd'
    )
      AND o.updated_at < ${cutoff}::timestamptz
    ORDER BY o.updated_at ASC
    LIMIT ${BATCH_LIMIT}
  `);
  return ((res?.rows ?? []) as any[]).map((r) => ({
    orderId: r.order_id,
    storeId: r.store_id ?? null,
    currentStatus: r.current_status,
    awb: r.awb ?? null,
    updatedAt: r.updated_at ?? null,
  }));
}

// Group by store so we open the Delhivery client once per store.
function groupByStore(rows: Candidate[]): Map<string, Candidate[]> {
  const m = new Map<string, Candidate[]>();
  for (const r of rows) {
    if (!r.storeId) continue;
    const arr = m.get(r.storeId) ?? [];
    arr.push(r);
    m.set(r.storeId, arr);
  }
  return m;
}

export async function reconcileShipmentStatus(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    noAwb: 0,
    noClient: 0,
    errorSamples: [],
    transitions: {},
  };

  const candidates = await pickCandidates();
  result.scanned = candidates.length;
  if (!candidates.length) return result;

  const byStore = groupByStore(candidates);

  for (const [storeId, rows] of Array.from(byStore.entries())) {
    let client;
    try {
      client = await getDelhiveryClient(storeId);
    } catch {
      // Delhivery not configured for this store (or store row missing) —
      // don't spam errors, just count and move on.
      result.noClient += rows.length;
      continue;
    }

    for (const row of rows) {
      if (!row.awb) {
        result.noAwb += 1;
        continue;
      }
      try {
        const track = await client.trackShipment(row.awb);
        if (!track.success) {
          // Not fatal — most likely Delhivery doesn't know this AWB yet
          // (very new) or too old to look up. Leave for next run.
          result.errors += 1;
          if (result.errorSamples.length < 10) {
            result.errorSamples.push(`${row.awb}: ${track.error ?? "track failed"}`);
          }
          continue;
        }

        // Same normalisation the webhook path runs, so heals converge
        // on identical state.
        const normalized = normalizeDelhivery({
          Shipment: {
            Status: {
              StatusType: track.statusType ?? "",
              Status: track.status ?? "",
              Instructions: track.instructions ?? "",
              NSLCode: track.statusCode ?? "",
            },
            NSLCode: track.statusCode ?? "",
          },
        });
        const unified = toUnifiedStatus({ source: "delhivery", rawStatus: normalized.status });

        if (unified === row.currentStatus) {
          result.unchanged += 1;
          continue;
        }

        // Persist. Three writes — same shape as the webhook handler —
        // so downstream (payroll metrics, dashboards, reshipment log)
        // sees consistent state.
        const shipment = await storage.getShipmentByOrderId(row.orderId);
        if (shipment) {
          await storage.updateShipment(shipment.id, {
            currentStatus: track.status ?? undefined,
            statusUpdatedAt: new Date(),
            ...(unified === "delivered" && !(shipment as any).deliveredAt
              ? { deliveredAt: new Date() }
              : {}),
          });
        }
        await storage.updateOrder(row.orderId, {
          shipmentStatus: (SHIPPING_STATUS_LABELS as any)[unified] || track.status,
          status: unified,
          isActionable: normalized.isActionable,
        });
        // id explicit + note-based audit trail — prod migrations
        // don't reliably carry the gen_random_uuid() default.
        await db.execute(sql`
          INSERT INTO order_status_history (id, order_id, status, previous_status, note, created_at)
          VALUES (
            gen_random_uuid(),
            ${row.orderId},
            ${unified},
            ${row.currentStatus},
            ${'cron/reconcile-shipment-status: healed from Delhivery live tracking'},
            NOW()
          )
        `);

        // Reshipment log follows the same mapping as the webhook.
        const reshipStatus =
          unified === "in_transit" || unified === "out_for_delivery"
            ? "in_transit"
            : unified === "ndr"
              ? "ndr"
              : unified === "delivered"
                ? "delivered"
                : unified === "rto_initiated" || unified === "rto_ofd" || unified === "rto_delivered"
                  ? "rto"
                  : null;
        if (reshipStatus) {
          void import("../reshipments/service")
            .then((s) =>
              s.updateStatusByAwb({
                awb: row.awb!,
                courierStatus: reshipStatus as any,
                courierName: "Delhivery",
              }),
            )
            .catch(() => {});
        }

        result.updated += 1;
        const key = `${row.currentStatus}→${unified}`;
        result.transitions[key] = (result.transitions[key] ?? 0) + 1;
      } catch (err: any) {
        result.errors += 1;
        if (result.errorSamples.length < 10) {
          result.errorSamples.push(`${row.awb}: ${err?.message ?? String(err)}`);
        }
      }
    }
  }

  return result;
}

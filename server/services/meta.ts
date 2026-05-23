import { db } from "../db";
import { marketingMetrics, stores, type InsertMarketingMetric } from "@shared/schema";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────
// Phase-1 multi-store transitional helper.
//
// marketing_metrics now has a composite PK (date, storeId) and storeId
// is NOT NULL. Until Phase 2 wires a request-scoped store context, the
// Meta sync runs against the single "legacy" stores row (the one the
// backfill created from the old shopify_credentials). We resolve it
// lazily by reading the oldest row from `stores` — there is exactly
// one until multi-store onboarding ships.
// ─────────────────────────────────────────────────────────────────────
async function resolveLegacyStoreId(): Promise<string> {
  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .orderBy(stores.createdAt)
    .limit(1);
  if (rows.length === 0) {
    throw new Error(
      "[meta] no stores row found — run server/scripts/backfill-store-id.ts first",
    );
  }
  return rows[0].id;
}

// ─────────────────────────────────────────────────────────────────────
// Meta Marketing API sync.
//
// Fetches daily insights (spend, purchases, purchase value) per ad
// account, merges them across accounts by date, then upserts into
// marketing_metrics so Pare Phase 4 can surface blended FB metrics.
//
// Auth: Bearer token via META_ACCESS_TOKEN env var.
// Accounts: comma-separated list in META_AD_ACCOUNT_IDS. Each ID may
//   or may not include the `act_` prefix — we normalize below.
//
// Action attribution: we use the canonical `purchase` action type
// (aggregate of all purchase events tracked by the pixel, regardless
// of surface). If you need a stricter attribution (e.g. only
// `offsite_conversion.fb_pixel_purchase`), swap the constant below.
// ─────────────────────────────────────────────────────────────────────

const META_API_VERSION = "v19.0";
const META_API_HOST = "https://graph.facebook.com";
const PURCHASE_ACTION_TYPE = "purchase";

type MetaAction = { action_type: string; value: string };
type MetaInsightRow = {
  date_start: string; // YYYY-MM-DD
  date_stop: string;
  spend?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};
type MetaInsightsResponse = {
  data: MetaInsightRow[];
  paging?: { next?: string; previous?: string };
  error?: { message: string; type: string; code: number };
};

export type MetaSyncResult = {
  startDate: string;
  endDate: string;
  accountsAttempted: number;
  accountsSucceeded: number;
  accountErrors: Array<{ accountId: string; message: string }>;
  daysUpserted: number;
  totals: { fbSpend: number; fbGmv: number; fbOrders: number };
};

function normalizeAccountId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

function readAccountIds(): string[] {
  const raw = process.env.META_AD_ACCOUNT_IDS ?? "";
  return raw
    .split(",")
    .map((s) => normalizeAccountId(s))
    .filter((s) => s.length > 0);
}

function sumAction(
  list: MetaAction[] | undefined,
  type = PURCHASE_ACTION_TYPE,
): number {
  if (!list) return 0;
  const row = list.find((a) => a.action_type === type);
  return row ? Number(row.value) || 0 : 0;
}

// Fetch all pages of insights for one ad account. Meta returns up to
// 25 rows per page by default; for a 30-day window with
// time_increment=1 that fits in one page, but we follow `paging.next`
// defensively in case limits change.
async function fetchAccountInsights(
  accountId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<MetaInsightRow[]> {
  const params = new URLSearchParams({
    time_increment: "1",
    fields: "spend,actions,action_values",
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    limit: "500",
  });
  let url: string | null = `${META_API_HOST}/${META_API_VERSION}/${accountId}/insights?${params.toString()}`;

  const rows: MetaInsightRow[] = [];
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body: MetaInsightsResponse = await res.json();
    if (!res.ok || body.error) {
      const msg = body.error?.message || `HTTP ${res.status}`;
      throw new Error(`Meta API error for ${accountId}: ${msg}`);
    }
    rows.push(...(body.data ?? []));
    url = body.paging?.next ?? null;
  }
  return rows;
}

// Run the full sync. `startDate` / `endDate` are YYYY-MM-DD strings.
// Returns a summary with per-account errors surfaced for ops visibility.
export async function syncMetaInsights(
  startDate: string,
  endDate: string,
): Promise<MetaSyncResult> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN env var is not set");
  }
  const accountIds = readAccountIds();
  if (accountIds.length === 0) {
    throw new Error("META_AD_ACCOUNT_IDS env var is empty");
  }
  // Resolve the legacy store row up front so the upsert below can
  // satisfy the new composite PK (date, storeId) + NOT NULL storeId.
  const storeId = await resolveLegacyStoreId();

  console.log(
    `[meta] syncing ${accountIds.length} account(s) for ${startDate} → ${endDate}`,
  );

  // Concurrent fan-out per the user's spec (Promise.all). Each account
  // is wrapped in a try/catch so one bad account doesn't abort the
  // entire sync — the Promise.all still completes and we surface
  // per-account errors in the result summary.
  const perAccount = await Promise.all(
    accountIds.map(async (id) => {
      try {
        const rows = await fetchAccountInsights(
          id,
          accessToken,
          startDate,
          endDate,
        );
        console.log(`[meta] ${id}: ${rows.length} day-rows`);
        return { id, rows, error: null as string | null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[meta] ${id} failed: ${message}`);
        return { id, rows: [] as MetaInsightRow[], error: message };
      }
    }),
  );

  // ── Merge across accounts, keyed by date_start. ────────────────
  type Agg = { fbSpend: number; fbGmv: number; fbOrders: number };
  const byDate = new Map<string, Agg>();
  for (const acct of perAccount) {
    for (const row of acct.rows) {
      const dateKey = row.date_start;
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { fbSpend: 0, fbGmv: 0, fbOrders: 0 });
      }
      const agg = byDate.get(dateKey)!;
      agg.fbSpend += Number(row.spend) || 0;
      agg.fbOrders += sumAction(row.actions);
      agg.fbGmv += sumAction(row.action_values);
    }
  }

  // ── Upsert each day's aggregate. Blended ROAS = gmv / spend. ───
  const upsertRows: InsertMarketingMetric[] = [];
  const totals: Agg = { fbSpend: 0, fbGmv: 0, fbOrders: 0 };
  for (const [date, agg] of Array.from(byDate.entries())) {
    totals.fbSpend += agg.fbSpend;
    totals.fbGmv += agg.fbGmv;
    totals.fbOrders += agg.fbOrders;
    upsertRows.push({
      date,
      storeId,
      fbSpend: agg.fbSpend.toFixed(2),
      fbGmv: agg.fbGmv.toFixed(2),
      fbOrders: Math.round(agg.fbOrders),
      fbRoas:
        agg.fbSpend > 0 ? (agg.fbGmv / agg.fbSpend).toFixed(4) : null,
    });
  }

  if (upsertRows.length > 0) {
    await db
      .insert(marketingMetrics)
      .values(upsertRows)
      .onConflictDoUpdate({
        // PK is composite (date, storeId) — both columns required here
        // so drizzle generates `ON CONFLICT (date, store_id) DO UPDATE`.
        target: [marketingMetrics.date, marketingMetrics.storeId],
        set: {
          fbSpend: sql`excluded.fb_spend`,
          fbGmv: sql`excluded.fb_gmv`,
          fbOrders: sql`excluded.fb_orders`,
          fbRoas: sql`excluded.fb_roas`,
          updatedAt: sql`now()`,
        },
      });
  }

  const accountErrors = perAccount
    .filter((a) => a.error)
    .map((a) => ({ accountId: a.id, message: a.error as string }));

  return {
    startDate,
    endDate,
    accountsAttempted: accountIds.length,
    accountsSucceeded: accountIds.length - accountErrors.length,
    accountErrors,
    daysUpserted: upsertRows.length,
    totals,
  };
}

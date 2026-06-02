import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  marketingMetrics,
  stores,
  type InsertMarketingMetric,
  type MetaAdAccountConfig,
} from "@shared/schema";
import { decrypt } from "../encryption";

// ─────────────────────────────────────────────────────────────────────
// Meta Marketing API sync — per-store, campaign-level.
//
// Token + linked-account config live on the `stores` row (encrypted token
// via server/encryption.ts; jsonb config). Each entry in
// stores.metaAdAccountsConfig pins one ad account and either pulls every
// campaign (`syncAll=true`) or a curated subset
// (`linkedCampaignIds: string[]`). We fetch insights at the campaign
// breakdown level so multiple stores can sit on the same ad account
// without their numbers blending.
//
// Two stores sharing one ad account is now safe: each store reads ONLY
// the campaigns it linked, aggregated under its own storeId on
// marketing_metrics (composite PK date+storeId).
// ─────────────────────────────────────────────────────────────────────

const META_API_VERSION = "v19.0";
const META_API_HOST = "https://graph.facebook.com";
const PURCHASE_ACTION_TYPE = "purchase";

type MetaAction = { action_type: string; value: string };
type MetaInsightRow = {
  date_start: string; // YYYY-MM-DD
  date_stop: string;
  campaign_id?: string;
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
  storeId: string;
  startDate: string;
  endDate: string;
  accountsAttempted: number;
  accountsSucceeded: number;
  accountErrors: Array<{ accountId: string; message: string }>;
  daysUpserted: number;
  totals: { fbSpend: number; fbGmv: number; fbOrders: number };
};

function sumAction(
  list: MetaAction[] | undefined,
  type = PURCHASE_ACTION_TYPE,
): number {
  if (!list) return 0;
  const row = list.find((a) => a.action_type === type);
  return row ? Number(row.value) || 0 : 0;
}

// Fetch all pages of insights for one ad account at the campaign
// breakdown level. Meta caps `limit` and pages via `paging.next`; we
// follow until exhausted.
async function fetchAccountCampaignInsights(
  accountId: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<MetaInsightRow[]> {
  const params = new URLSearchParams({
    level: "campaign",
    time_increment: "1",
    fields: "campaign_id,spend,actions,action_values",
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

/**
 * Run the per-store Meta sync. Reads encrypted token + linked-account
 * config from the `stores` row, fetches campaign-level insights for
 * each linked account, filters by the store's `linkedCampaignIds`
 * (unless `syncAll`), and upserts daily totals into marketing_metrics.
 *
 * `startDate` / `endDate` are YYYY-MM-DD strings.
 */
export async function syncMetaInsights(
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<MetaSyncResult> {
  // ── Resolve token + config from the store row. ───────────────────
  const [storeRow] = await db
    .select({
      id: stores.id,
      metaAccessToken: stores.metaAccessToken,
      metaAdAccountsConfig: stores.metaAdAccountsConfig,
    })
    .from(stores)
    .where(eq(stores.id, storeId))
    .limit(1);

  if (!storeRow) {
    throw new Error(`Store not found: ${storeId}`);
  }
  if (!storeRow.metaAccessToken) {
    throw new Error("Meta token not configured for this store");
  }
  const accessToken = decrypt(storeRow.metaAccessToken);
  if (!accessToken) {
    throw new Error("Meta token failed to decrypt for this store");
  }

  const config: MetaAdAccountConfig[] = Array.isArray(
    storeRow.metaAdAccountsConfig,
  )
    ? (storeRow.metaAdAccountsConfig as MetaAdAccountConfig[])
    : [];
  if (config.length === 0) {
    throw new Error("No Meta ad accounts linked for this store");
  }

  console.log(
    `[meta] store=${storeId} syncing ${config.length} account(s) for ${startDate} → ${endDate}`,
  );

  // ── Concurrent fan-out per account. Each account is wrapped in a
  // try/catch so one bad account doesn't abort the rest; per-account
  // errors are surfaced in the result summary. ─────────────────────
  const perAccount = await Promise.all(
    config.map(async (entry) => {
      try {
        const rows = await fetchAccountCampaignInsights(
          entry.adAccountId,
          accessToken,
          startDate,
          endDate,
        );
        // Apply per-account linkedCampaignIds filter unless syncAll.
        const filtered = entry.syncAll
          ? rows
          : rows.filter(
              (r) =>
                r.campaign_id != null &&
                entry.linkedCampaignIds.includes(r.campaign_id),
            );
        console.log(
          `[meta] ${entry.adAccountId}: ${rows.length} campaign-day rows fetched, ${filtered.length} after link filter`,
        );
        return {
          id: entry.adAccountId,
          rows: filtered,
          error: null as string | null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[meta] ${entry.adAccountId} failed: ${message}`);
        return {
          id: entry.adAccountId,
          rows: [] as MetaInsightRow[],
          error: message,
        };
      }
    }),
  );

  // ── Merge matching campaign-day rows across accounts, keyed by date. ──
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
    storeId,
    startDate,
    endDate,
    accountsAttempted: config.length,
    accountsSucceeded: config.length - accountErrors.length,
    accountErrors,
    daysUpserted: upsertRows.length,
    totals,
  };
}

// =============================================================================
// PG ADAPTER INTERFACE
// =============================================================================
//
// Every payment gateway (PayU today; Razorpay / Cashfree / PhonePe later)
// implements this interface. The matcher, the CSV upload route, and the
// (V2) settlement-fetch cron all speak this contract — never the
// concrete adapter directly. That's what makes "add a new PG" a 1-file
// change: drop a new `server/pgs/<name>.ts`, register it in `index.ts`,
// the rest of the app keeps working.
//
// Design choice: keep the surface tiny. V1 needs `parseSettlementCsv`
// and `expectedFee`. V2 will add `fetchSettlements` (when PG support
// enables the API on the merchant account). We resist adding methods
// here speculatively — every adapter has to implement everything we
// add, so the cost of breadth is N×.
// =============================================================================

import type { InsertPgSettlement, PgName, PgRateCardRules } from "@shared/schema";

/**
 * Per-store ingestion context. The matcher needs to know which store
 * a settlement file belongs to so the same PG payment id from two
 * different tenants doesn't collide on the composite unique key.
 *
 * `storeId` is intentionally `string | null` (not just `string`) — the
 * Phase 1 multi-store backfill leaves some legacy rows with NULL store
 * scope, and the storage layer's `getPgSettlementByPaymentId` accepts
 * NULL too. Forcing a non-null here would surprise callers later.
 */
export interface ParseOpts {
  storeId: string | null;
  /**
   * Original filename. Stored verbatim on each row's `sourceFile`
   * column so a future "which CSV did this row come from?" audit
   * isn't a guessing game.
   */
  sourceFile?: string;
}

/**
 * Result envelope from a parse. We surface both successes AND
 * machine-readable errors because real PG exports always have at
 * least one weird row, and silently skipping them is the kind of
 * bug that destroys trust the first time finance audits.
 */
export interface ParseResult {
  /** Normalised rows ready for `storage.bulkUpsertPgSettlements()`. */
  rows: InsertPgSettlement[];
  /** Count of rows the parser deliberately skipped (e.g. status != SUCCESS). */
  skipped: number;
  /** Per-row parse failures the admin should see in the upload UI. */
  errors: Array<{ row: number; reason: string }>;
}

/**
 * Expected fee breakdown for an order of the given gross amount.
 * Used by the matcher's mismatch-classification step: if `(gross -
 * settled)` differs from `(expectedFee.fee + expectedFee.gst)` by
 * more than tolerance, we flag the order as MISMATCH.
 *
 * Returned in rupees (number, not the stringified decimal storage
 * format) — every caller does math with these, never raw DB writes.
 */
export interface ExpectedFee {
  fee: number;
  gst: number;
  /** Convenience: fee + gst. The total deduction we'd expect. */
  totalDeduction: number;
}

export interface PgAdapter {
  /** Canonical lowercase PG name. Matches the `pg_settlements.pg_name` column. */
  readonly name: PgName;

  /** Human-friendly label for the UI ("PayU India", "Razorpay", etc.). */
  readonly displayName: string;

  /**
   * Parse a settlement report CSV the admin uploaded into our schema.
   * Implementation is per-PG because each gateway's column names and
   * date formats differ. Treat unknown columns as data we don't yet
   * use rather than errors — PGs add columns over time and we
   * shouldn't break on every new field.
   *
   * Idempotent on re-upload: returned rows go through
   * `storage.bulkUpsertPgSettlements`, which dedupes via the composite
   * unique key.
   */
  parseSettlementCsv(csvText: string, opts: ParseOpts): Promise<ParseResult>;

  /**
   * Expected MDR + GST given a gross order amount in rupees.
   * The matcher feeds this into mismatch detection.
   *
   * Adapters should respect the optional `ctx` argument:
   *   - `rules` — the active rate card from `pg_rate_cards`. When
   *     present, the adapter uses these rates instead of its
   *     hardcoded defaults.
   *   - `paymentMode` — PayU's "Payment Type" column value
   *     ("Credit Card", "UPI", "Net Banking" etc.). Enables
   *     per-mode rate overrides defined in `rules.byPaymentMode`.
   *
   * Adapters that don't yet handle ctx should ignore it cleanly —
   * the signature is opt-in.
   */
  expectedFee(
    grossInRupees: number,
    ctx?: { rules?: PgRateCardRules; paymentMode?: string },
  ): ExpectedFee;

  /**
   * (V2 — when PG support enables programmatic settlement reports.)
   * Pull settlements for the date window via the PG's API. Not
   * required for V1. Adapters that don't implement this stay safely
   * undefined; the upload route is the only ingestion path until then.
   */
  fetchSettlements?(args: {
    storeId: string;
    fromDate: Date;
    toDate: Date;
    apiKey: string;
    apiSecret: string;
  }): Promise<InsertPgSettlement[]>;
}

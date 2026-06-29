// =============================================================================
// PAYU INDIA ADAPTER
// =============================================================================
//
// Parses the settlement report CSV that PayU's merchant dashboard
// generates ("Download Settlement Report"). Column layout was reverse-
// engineered from a real export — see notes near `COLUMN_ALIASES`.
//
// Glow & Me + OLB both use PayU via Fastrr (a Shiprocket checkout
// product). That's why `pgPaymentId` (= PayU's `mihpayid`) is the
// bridge key, NOT the merchant txn id. The merchant txn id PayU sees
// is the Fastrr-generated checkout token, opaque to Shopify. The
// Shopify orders carry the `mihpayid` back in `note_attributes` under
// `PayU_txn_id` — that's where our matcher reconnects the two halves.
//
// We accept multiple column-name spellings (`Amount(INR)` vs
// `Amount (INR)` vs `Gross Amount`) because PayU has shipped at least
// two header naming styles across merchant accounts, and Excel
// occasionally munges spacing on round-trips through SaveAs.
// =============================================================================

import type { PgAdapter, ParseOpts, ParseResult, ExpectedFee } from "./base";
import type { InsertPgSettlement, PgRateCardRules } from "@shared/schema";

// -----------------------------------------------------------------------------
// Column aliases — the parser tries each alias in order and uses the
// first one that appears in the CSV header. Lowercase comparison.
// -----------------------------------------------------------------------------
const COLUMN_ALIASES: Record<
  keyof Pick<
    InsertPgSettlement,
    | "pgPaymentId"
    | "pgOrderId"
    | "grossAmount"
    | "settledAmount"
    | "feeDeducted"
    | "taxOnFee"
    | "settledAt"
    | "pgTransactionAt"
    | "utrNumber"
  >,
  string[]
> = {
  // `mihpayid` — the bridge key. Always present, always 11 digits.
  pgPaymentId: ["payu id", "payu payment id", "mihpayid"],
  // Fastrr checkout token (e.g. `Shexkrew1780656552958`).
  pgOrderId: ["merchant txn id", "merchant transaction id", "txn id"],
  // Customer-paid amount BEFORE PG fees. The number Shopify expects.
  grossAmount: ["amount(inr)", "amount (inr)", "amount", "gross amount"],
  // What actually settles to the bank (gross − MDR − GST).
  settledAmount: [
    "net amount",
    "amount(net)",
    "amount (net)",
    "net to merchant",
    "settlement amount",
  ],
  // PG's processing fee (MDR). Sometimes empty per-row; we then
  // derive it as `grossAmount − settledAmount − taxOnFee` if both
  // sides have numbers.
  feeDeducted: ["payment processing fee", "total processing fees", "mdr"],
  taxOnFee: ["total service tax", "service tax", "gst on fee"],
  settledAt: ["settlement date"],
  // PayU's column for "when did the txn succeed at the gateway."
  // Different from Settlement Date — settlement is T+2 after this.
  pgTransactionAt: ["succeedon", "succeeded on", "transaction date"],
  utrNumber: ["merchant utr", "utr number", "utr"],
};

// PayU's success marker. Refunds use "refund_success" etc. — for V1
// we only ingest successful captures; refund netting is V2.
const SUCCESS_STATUS_VALUES = ["success", "captured", "1"];

// -----------------------------------------------------------------------------
// Default contracted PG rates. Real merchants negotiate these — we read
// them from `app_settings` per store in a later pass; for V1 these are
// the catalog defaults that match Glow & Me's PayU contract.
// -----------------------------------------------------------------------------
const DEFAULT_MDR_PCT = 1.2; // 1.20% of gross
const DEFAULT_GST_ON_FEE_PCT = 18.0; // 18% of MDR

// =============================================================================

export const payuAdapter: PgAdapter = {
  name: "payu",
  displayName: "PayU India",

  async parseSettlementCsv(
    csvText: string,
    opts: ParseOpts,
  ): Promise<ParseResult> {
    const rows: InsertPgSettlement[] = [];
    const errors: ParseResult["errors"] = [];
    let skipped = 0;

    // ----- Tokenise into header + records ----------------------------------
    // PayU exports use comma-separated CSV with quoted fields when the
    // value contains a comma (rare in settlement files — UPI VPAs and
    // bank refs are alphanumeric). A bespoke split is fine here; we
    // don't need the full csv-parser stream machinery for an in-memory
    // string that's already loaded.
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      return { rows: [], skipped: 0, errors: [{ row: 0, reason: "empty file" }] };
    }

    const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());

    // Build a map of {desired field -> column index in this file},
    // resolving aliases. If a required field has no matching column
    // we abort early with a clear error rather than producing rows
    // that silently lose data.
    const colIdx: Partial<Record<keyof typeof COLUMN_ALIASES, number>> = {};
    for (const key of Object.keys(COLUMN_ALIASES) as Array<keyof typeof COLUMN_ALIASES>) {
      for (const alias of COLUMN_ALIASES[key]) {
        const idx = header.indexOf(alias);
        if (idx >= 0) {
          colIdx[key] = idx;
          break;
        }
      }
    }

    if (colIdx.pgPaymentId === undefined) {
      return {
        rows: [],
        skipped: 0,
        errors: [
          {
            row: 0,
            reason:
              "could not find PayU ID column (tried: " +
              COLUMN_ALIASES.pgPaymentId.join(", ") +
              "). Is this actually a PayU settlement export?",
          },
        ],
      };
    }
    if (colIdx.settledAmount === undefined) {
      return {
        rows: [],
        skipped: 0,
        errors: [
          {
            row: 0,
            reason:
              "could not find Net Amount column (tried: " +
              COLUMN_ALIASES.settledAmount.join(", ") +
              ")",
          },
        ],
      };
    }

    // Status column is optional — if missing, we accept all rows.
    const statusIdx = header.indexOf("status");

    // ----- Iterate records -------------------------------------------------
    for (let i = 1; i < lines.length; i++) {
      const lineNo = i + 1; // 1-indexed, accounting for header
      const fields = splitCsvLine(lines[i]);
      if (fields.length === 0) continue;

      // Status filter — only success rows in V1. Refunds and failures
      // get the `skipped` counter, not an error.
      if (statusIdx >= 0) {
        const status = (fields[statusIdx] ?? "").trim().toLowerCase();
        if (status && !SUCCESS_STATUS_VALUES.includes(status)) {
          skipped++;
          continue;
        }
      }

      const pgPaymentId = (fields[colIdx.pgPaymentId!] ?? "").trim();
      if (!pgPaymentId) {
        errors.push({ row: lineNo, reason: "missing PayU ID" });
        continue;
      }

      const grossAmount = parseAmount(fields[colIdx.grossAmount ?? -1]);
      const settledAmount = parseAmount(fields[colIdx.settledAmount!]);
      if (settledAmount === null) {
        errors.push({ row: lineNo, reason: "missing/unparseable Net Amount" });
        continue;
      }

      let feeDeducted = parseAmount(fields[colIdx.feeDeducted ?? -1]);
      let taxOnFee = parseAmount(fields[colIdx.taxOnFee ?? -1]);

      // PayU's real-world quirk: per-row fee columns are often blank
      // OR explicitly 0, with fees computed at batch level. The TRUTH
      // is always (gross − settled). When PayU's reported fee is
      // missing OR reported as zero AND gross > settled, we override
      // with the derived value. This is the change from the V1 first
      // pass — we used to only derive when both were NULL, but PayU
      // ships explicit zeros in many merchant accounts, which made
      // the derivation never fire and the fee column showed ₹0 even
      // when ~10% had been deducted.
      if (
        grossAmount !== null &&
        settledAmount !== null &&
        grossAmount > settledAmount &&
        (feeDeducted === null || feeDeducted === 0) &&
        (taxOnFee === null || taxOnFee === 0)
      ) {
        feeDeducted = +(grossAmount - settledAmount).toFixed(2);
      }

      // Build the raw payload jsonb — keep every column verbatim
      // so an admin can re-inspect / re-parse without the original
      // CSV. Sensitive fields (card masks) are stripped at the
      // Column Settings step in PayU's dashboard, so we don't have
      // to filter here.
      const rawPayload: Record<string, string> = {};
      for (let h = 0; h < header.length; h++) {
        rawPayload[header[h]] = fields[h] ?? "";
      }

      rows.push({
        storeId: opts.storeId,
        pgName: "payu",
        pgPaymentId,
        pgOrderId: (fields[colIdx.pgOrderId ?? -1] ?? "").trim() || null,
        grossAmount: grossAmount !== null ? grossAmount.toFixed(2) : null,
        settledAmount: settledAmount.toFixed(2),
        feeDeducted: feeDeducted !== null ? feeDeducted.toFixed(2) : null,
        taxOnFee: taxOnFee !== null ? taxOnFee.toFixed(2) : null,
        settledAt: parseDate(fields[colIdx.settledAt ?? -1]),
        pgTransactionAt: parseDate(fields[colIdx.pgTransactionAt ?? -1]),
        utrNumber: (fields[colIdx.utrNumber ?? -1] ?? "").trim() || null,
        status: "pending", // matcher promotes this; ingester never sets settled/overdue/mismatch
        rawPayload,
        sourceFile: opts.sourceFile ?? null,
      });
    }

    // Defensive within-CSV dedup. A single CSV with two rows that share
    // pgPaymentId would crash the bulk upsert with "ON CONFLICT DO
    // UPDATE cannot affect row a second time". PayU's own CSVs don't
    // do this, but malformed exports or sloppy hand-edits sometimes
    // do. Keep the FIRST occurrence and skip the rest — return the
    // skip count to the caller so the UI can surface it.
    const seenInBatch = new Set<string>();
    const deduped: InsertPgSettlement[] = [];
    for (const r of rows) {
      if (seenInBatch.has(r.pgPaymentId)) {
        skipped++;
        errors.push({
          row: -1,
          reason: `Duplicate pgPaymentId ${r.pgPaymentId} within the same file — kept first occurrence, skipped rest.`,
        });
        continue;
      }
      seenInBatch.add(r.pgPaymentId);
      deduped.push(r);
    }

    return { rows: deduped, skipped, errors };
  },

  expectedFee(grossInRupees: number, ctx?: { rules?: PgRateCardRules; paymentMode?: string }): ExpectedFee {
    const rules = ctx?.rules;
    // Resolution order:
    //   1. byPaymentMode (if a mode is provided AND there's a match)
    //   2. byAmountTier (first tier matching the gross amount)
    //   3. rules.default
    //   4. hardcoded fallback (when no rate card configured)
    let mdrPct = DEFAULT_MDR_PCT;
    let gstPct = DEFAULT_GST_ON_FEE_PCT;

    if (rules) {
      mdrPct = rules.default.mdrPct;
      gstPct = rules.default.gstPct;

      if (ctx?.paymentMode && rules.byPaymentMode) {
        // Case-insensitive lookup. PayU's "Payment Type" column ships
        // values like "Credit Card", "UPI", "Net Banking".
        const modeKey = Object.keys(rules.byPaymentMode).find(
          (k) => k.toLowerCase() === ctx.paymentMode!.toLowerCase(),
        );
        if (modeKey) {
          mdrPct = rules.byPaymentMode[modeKey].mdrPct;
          gstPct = rules.byPaymentMode[modeKey].gstPct;
        }
      }

      if (rules.byAmountTier) {
        const tier = rules.byAmountTier.find(
          (t) =>
            grossInRupees >= t.minAmount &&
            (t.maxAmount === undefined || grossInRupees < t.maxAmount),
        );
        if (tier) {
          mdrPct = tier.mdrPct;
          gstPct = tier.gstPct;
        }
      }
    }

    const fee = +(grossInRupees * (mdrPct / 100)).toFixed(2);
    const gst = +(fee * (gstPct / 100)).toFixed(2);
    return { fee, gst, totalDeduction: +(fee + gst).toFixed(2) };
  },

  // fetchSettlements deliberately not implemented — V2 ticket.
};

// -----------------------------------------------------------------------------
// Tiny utilities. Kept inline rather than a shared csv-utils file because
// each PG's CSV is just-different-enough that "shared" usually means
// "shared bugs" — see how Razorpay's CSV uses semicolon separators in
// some locales. Per-adapter parsing is a feature, not duplication.
// -----------------------------------------------------------------------------

/**
 * RFC-4180 lite: split a CSV line respecting double-quoted fields and
 * `""` as escape for inner double-quote. Sufficient for the PayU
 * dashboard export format; not a general-purpose CSV implementation.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

/**
 * Strip currency symbols / commas / whitespace and return a number,
 * or null if the cell is empty or unparseable. We intentionally
 * return null rather than 0 on parse failure — the difference between
 * "amount is zero" and "amount is unknown" is real and matters at the
 * matcher tolerance check.
 */
function parseAmount(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const cleaned = String(raw).replace(/[₹$,\s]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * PayU dates come in two shapes in practice:
 *   - "2026-06-08 00:02:17"   (settlement date, ISO-ish)
 *   - "2026-06-05 16:20:13"   (succeedon, same shape)
 * Both are IST. We append `+05:30` so the stored timestamptz is
 * unambiguous instead of getting parsed as UTC.
 */
function parseDate(raw: string | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  // If the string already has a TZ designator, trust it.
  if (/[+-]\d{2}:?\d{2}$|Z$/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Naive IST. Compose an ISO string with +05:30 explicit offset.
  const iso = trimmed.replace(" ", "T") + "+05:30";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

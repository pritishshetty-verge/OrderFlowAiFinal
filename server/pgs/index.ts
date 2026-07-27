// =============================================================================
// PG ADAPTER REGISTRY
// =============================================================================
//
// Lookup table from `pg_name` → adapter implementation. The CSV upload
// route and the matcher both call `getPgAdapter("payu")` rather than
// importing the concrete module — that's what makes "add Razorpay" a
// 2-line change at this file and a new adapter module.
//
// Adapters that aren't yet implemented are deliberately ABSENT from
// the registry rather than stubbed with a "throw not implemented".
// `getPgAdapter` returns `undefined` for unregistered names and the
// caller surfaces a clean "Razorpay support is coming soon" error to
// the admin — far better UX than a runtime exception.
// =============================================================================

import type { PgAdapter } from "./base";
import type { PgName } from "@shared/schema";
import { payuAdapter } from "./payu";

const REGISTRY: Partial<Record<PgName, PgAdapter>> = {
  payu: payuAdapter,
  // razorpay: razorpayAdapter,  ← uncomment when server/pgs/razorpay.ts lands
  // cashfree: cashfreeAdapter,
  // phonepe:  phonepeAdapter,
};

export function getPgAdapter(name: PgName): PgAdapter | undefined {
  return REGISTRY[name];
}

/**
 * Names of every PG we can actively process today. The Settings UI
 * uses this to show "Connect" vs "Coming soon" badges per PG card
 * without hardcoding the list in two places.
 */
export function getActivePgNames(): PgName[] {
  return Object.keys(REGISTRY) as PgName[];
}

export type { PgAdapter, ParseOpts, ParseResult, ExpectedFee } from "./base";

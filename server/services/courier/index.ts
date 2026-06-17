/**
 * Reverse-pickup provider registry.
 *
 * Resolves the CourierProvider a store should use for reverse logistics. Today
 * Delhivery is the only active provider; Shiprocket / F-ship / others slot in
 * here by adding a case below (and a class implementing CourierProvider). The
 * route layer only ever talks to the resolved provider via scheduleReversePickup().
 */

import { getDelhiveryClient } from "../delhivery";
import type { CourierProvider } from "./types";

export * from "./types";

// Providers we know how to schedule reverse pickups with. Extend this union as
// new aggregators are onboarded.
export const REVERSE_PICKUP_PROVIDERS = ["delhivery"] as const;
export type ReverseLogisticsProvider = (typeof REVERSE_PICKUP_PROVIDERS)[number];

export const DEFAULT_REVERSE_PROVIDER: ReverseLogisticsProvider = "delhivery";

/**
 * Resolve the reverse-pickup provider for a store. `provider` will, in future,
 * come from a per-store setting (stores.reverseLogisticsProvider); until that
 * exists it defaults to Delhivery. Throws a clear error if the requested
 * provider isn't supported or the store hasn't configured it — the caller maps
 * that to a 400 so ops sees a "not configured" message.
 */
export async function resolveReversePickupProvider(
  storeId: string,
  provider: ReverseLogisticsProvider = DEFAULT_REVERSE_PROVIDER,
): Promise<CourierProvider> {
  switch (provider) {
    case "delhivery":
      // DelhiveryClient implements CourierProvider; the factory throws if the
      // store has no Delhivery credentials configured.
      return getDelhiveryClient(storeId);
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Reverse pickups are not supported for provider "${_exhaustive}"`);
    }
  }
}

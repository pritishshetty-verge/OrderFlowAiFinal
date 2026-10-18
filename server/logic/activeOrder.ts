/**
 * Single definition of an "active" order for agent workload purposes.
 *
 * An order is active only while BOTH sides are still unfinished:
 *   - the agent hasn't closed the call  (call_status NOT IN confirmed/cancelled)
 *   - the warehouse hasn't shipped it   (fulfillment_status NOT IN fulfilled/partial)
 *
 * Both statuses are compared after trim + lowercase, and NULL is treated
 * as the empty string (i.e. still open). `isActiveOrder` is the in-memory
 * form; `activeOrderCondition` is the identical predicate as SQL so the
 * database can count per agent without shipping rows to the server.
 * The unit test in activeOrder.test.ts keeps the two in lockstep.
 */
import { and, notInArray, sql, type SQL } from "drizzle-orm";
import { orders } from "@shared/schema";

export const CLOSED_CALL_STATUSES = ["confirmed", "cancelled"] as const;
export const CLOSED_FULFILLMENT_STATUSES = ["fulfilled", "partial"] as const;

function normalise(value: string | null | undefined): string {
  return ((value || "") + "").trim().toLowerCase();
}

export function isActiveOrder(order: {
  callStatus: string | null | undefined;
  fulfillmentStatus: string | null | undefined;
}): boolean {
  const callStatus = normalise(order.callStatus);
  const fulfillmentStatus = normalise(order.fulfillmentStatus);
  const agentFinished = (CLOSED_CALL_STATUSES as readonly string[]).includes(callStatus);
  const warehouseFinished = (CLOSED_FULFILLMENT_STATUSES as readonly string[]).includes(fulfillmentStatus);
  return !agentFinished && !warehouseFinished;
}

/**
 * SQL form of isActiveOrder against the `orders` table:
 *   lower(trim(coalesce(call_status, '')))        not in ('confirmed','cancelled')
 *   and lower(trim(coalesce(fulfillment_status, ''))) not in ('fulfilled','partial')
 */
export function activeOrderCondition(): SQL {
  return and(
    notInArray(
      sql`lower(trim(coalesce(${orders.callStatus}, '')))`,
      [...CLOSED_CALL_STATUSES],
    ),
    notInArray(
      sql`lower(trim(coalesce(${orders.fulfillmentStatus}, '')))`,
      [...CLOSED_FULFILLMENT_STATUSES],
    ),
  )!;
}

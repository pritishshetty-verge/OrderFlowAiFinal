import { db } from "../server/db";
import { orders, appSettings } from "@shared/schema";
import { eq, and, isNotNull, gt, sql } from "drizzle-orm";

async function fixMetricsPollution() {
  console.log("=== Metrics Pollution Cleanup Script ===\n");

  // Step 1: Get configured prepaid payment methods
  console.log("Reading prepaid payment methods from app_settings...");
  const setting = await db.select()
    .from(appSettings)
    .where(eq(appSettings.key, "prepaid_payment_methods"))
    .limit(1);

  const prepaidMethods: string[] = setting.length > 0 
    ? (setting[0].value as string[]).map((m: string) => m.toLowerCase())
    : [];

  if (prepaidMethods.length === 0) {
    console.log("WARNING: No prepaid payment methods configured. Please configure them in Settings > Shopify first.");
    console.log("Exiting without making changes.\n");
    return;
  }

  console.log(`Found ${prepaidMethods.length} prepaid methods: ${prepaidMethods.join(", ")}\n`);

  // Create PostgreSQL array literal
  const prepaidArrayLiteral = `{${prepaidMethods.map(m => `"${m}"`).join(",")}}`;

  // Task 1: Unassign wrongly assigned prepaid orders
  console.log("Task 1: Finding prepaid orders with agent assignments...");
  
  const prepaidOrdersResult = await db
    .update(orders)
    .set({ assignedTo: null })
    .where(
      and(
        isNotNull(orders.assignedTo),
        sql`LOWER(${orders.paymentMethod}) = ANY(${prepaidArrayLiteral}::text[])`
      )
    )
    .returning({ id: orders.id });

  const prepaidCount = prepaidOrdersResult.length;
  console.log(`Unassigned ${prepaidCount} Prepaid Orders.\n`);

  // Task 2: Unassign "Fake Win" COD orders (confirmed after fulfilled)
  console.log("Task 2: Finding 'Fake Win' COD orders (confirmed after shipped)...");
  
  const fakeWinOrdersResult = await db
    .update(orders)
    .set({ assignedTo: null })
    .where(
      and(
        isNotNull(orders.assignedTo),
        sql`LOWER(${orders.paymentMethod}) != ALL(${prepaidArrayLiteral}::text[])`,
        isNotNull(orders.confirmedAt),
        isNotNull(orders.fulfilledAt),
        gt(orders.confirmedAt, orders.fulfilledAt)
      )
    )
    .returning({ id: orders.id });

  const fakeWinCount = fakeWinOrdersResult.length;
  console.log(`Unassigned ${fakeWinCount} 'Fake Win' COD Orders.\n`);

  // Summary
  const totalFixed = prepaidCount + fakeWinCount;
  console.log("=== Cleanup Complete ===");
  console.log(`Total records fixed: ${totalFixed}`);
  console.log(`  - Prepaid orders unassigned: ${prepaidCount}`);
  console.log(`  - Fake Win COD orders unassigned: ${fakeWinCount}`);
  console.log("\nYour Confirmation Rate metrics should now be accurate!");
}

fixMetricsPollution()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error running cleanup script:", error);
    process.exit(1);
  });

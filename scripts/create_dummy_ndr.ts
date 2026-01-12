/**
 * Test script to create dummy NDR orders for UI verification
 * Creates two test orders:
 * - EOD-74 (Customer Unavailable) - ACTIONABLE - should show Reattempt button
 * - EOD-6 (Out of Delivery Area) - NON-ACTIONABLE - should show badge
 * 
 * Run with: npx tsx scripts/create_dummy_ndr.ts
 * Cleanup: npx tsx scripts/create_dummy_ndr.ts --cleanup
 */

import { db } from "../server/db";
import { orders, shipments, ndrEvents } from "../shared/schema";
import { eq, or, like } from "drizzle-orm";

const TEST_SHOPIFY_IDS = {
  actionable: "TEST-SHOPIFY-ACTIONABLE-9998",
  nonActionable: "TEST-SHOPIFY-NONACTIONABLE-9999",
};

async function cleanup() {
  console.log("🧹 Cleaning up test NDR data...\n");

  const deletedNdrEvents = await db.delete(ndrEvents)
    .where(
      or(
        eq(ndrEvents.awb, "TEST-AWB-ACTIONABLE"),
        eq(ndrEvents.awb, "TEST-AWB-NONACTIONABLE")
      )
    )
    .returning();
  console.log(`   Deleted ${deletedNdrEvents.length} NDR events`);

  const deletedShipments = await db.delete(shipments)
    .where(
      or(
        eq(shipments.awb, "TEST-AWB-ACTIONABLE"),
        eq(shipments.awb, "TEST-AWB-NONACTIONABLE")
      )
    )
    .returning();
  console.log(`   Deleted ${deletedShipments.length} shipments`);

  const deletedOrders = await db.delete(orders)
    .where(
      or(
        eq(orders.shopifyOrderId, TEST_SHOPIFY_IDS.actionable),
        eq(orders.shopifyOrderId, TEST_SHOPIFY_IDS.nonActionable)
      )
    )
    .returning();
  console.log(`   Deleted ${deletedOrders.length} orders`);

  console.log("\n✅ Cleanup complete!");
}

async function createTestData() {
  console.log("=".repeat(60));
  console.log("Creating Test NDR Orders for UI Verification");
  console.log("=".repeat(60));

  const now = new Date();

  await cleanup();
  console.log("\n" + "-".repeat(60) + "\n");

  console.log("📦 Creating test orders...\n");

  const [actionableOrder] = await db.insert(orders).values({
    shopifyOrderId: TEST_SHOPIFY_IDS.actionable,
    shopifyOrderNumber: "#TEST-9998",
    customerName: "TEST-ACTIONABLE - Customer Unavailable",
    customerEmail: "test.actionable@example.com",
    customerPhone: "9999999998",
    status: "shipped",
    callStatus: "Confirmed",
    paymentMethod: "cod",
    totalPrice: "999.00",
    subtotal: "999.00",
    shipmentStatus: "UD",
    nslCode: "EOD-74",
    failureReason: "Customer was not available at delivery address",
    lastFailedAt: now,
    shippingAddressLine1: "Test Address Line 1",
    shippingCity: "Delhi",
    shippingState: "Delhi",
    shippingPincode: "110001",
    shippingCountry: "India",
    shopifyCreatedAt: now,
    shopifyUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning();

  console.log(`   ✅ Created actionable order: ${actionableOrder.id}`);
  console.log(`      NSL Code: EOD-74 (Customer Unavailable)`);
  console.log(`      Expected UI: Reattempt Delivery button\n`);

  const [nonActionableOrder] = await db.insert(orders).values({
    shopifyOrderId: TEST_SHOPIFY_IDS.nonActionable,
    shopifyOrderNumber: "#TEST-9999",
    customerName: "TEST-NON-ACTIONABLE - Out of Area",
    customerEmail: "test.nonactionable@example.com",
    customerPhone: "9999999999",
    status: "shipped",
    callStatus: "Confirmed",
    paymentMethod: "cod",
    totalPrice: "1299.00",
    subtotal: "1299.00",
    shipmentStatus: "UD",
    nslCode: "EOD-6",
    failureReason: "Location is outside serviceable delivery area",
    lastFailedAt: now,
    shippingAddressLine1: "Remote Location Address",
    shippingCity: "Remote Village",
    shippingState: "Arunachal Pradesh",
    shippingPincode: "790001",
    shippingCountry: "India",
    shopifyCreatedAt: now,
    shopifyUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning();

  console.log(`   ✅ Created non-actionable order: ${nonActionableOrder.id}`);
  console.log(`      NSL Code: EOD-6 (Out of Delivery Area)`);
  console.log(`      Expected UI: Non-Actionable badge\n`);

  console.log("🚚 Creating test shipments...\n");

  const [actionableShipment] = await db.insert(shipments).values({
    orderId: actionableOrder.id,
    shopifyOrderId: actionableOrder.shopifyOrderId,
    awb: "TEST-AWB-ACTIONABLE",
    courierName: "Delhivery",
    status: "ndr",
    currentStatus: "Undelivered",
    statusUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning();

  console.log(`   ✅ Created shipment: ${actionableShipment.awb}`);

  const [nonActionableShipment] = await db.insert(shipments).values({
    orderId: nonActionableOrder.id,
    shopifyOrderId: nonActionableOrder.shopifyOrderId,
    awb: "TEST-AWB-NONACTIONABLE",
    courierName: "Delhivery",
    status: "ndr",
    currentStatus: "Undelivered",
    statusUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  }).returning();

  console.log(`   ✅ Created shipment: ${nonActionableShipment.awb}\n`);

  console.log("⚠️  Creating NDR events...\n");

  await db.insert(ndrEvents).values({
    shipmentId: actionableShipment.id,
    orderId: actionableOrder.id,
    awb: "TEST-AWB-ACTIONABLE",
    ndrStatus: "customer_unavailable",
    ndrReason: "Customer was not available at delivery address",
    ndrDate: now,
    resolved: false,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`   ✅ Created NDR event for actionable order`);

  await db.insert(ndrEvents).values({
    shipmentId: nonActionableShipment.id,
    orderId: nonActionableOrder.id,
    awb: "TEST-AWB-NONACTIONABLE",
    ndrStatus: "other",
    ndrReason: "Location is outside serviceable delivery area",
    ndrDate: now,
    resolved: false,
    createdAt: now,
    updatedAt: now,
  });

  console.log(`   ✅ Created NDR event for non-actionable order`);

  console.log("\n" + "=".repeat(60));
  console.log("✅ TEST DATA CREATED SUCCESSFULLY!");
  console.log("=".repeat(60));
  console.log("\nNow go to the NDR Dashboard to verify:");
  console.log("  1. TEST-ACTIONABLE order should have 'Reattempt Delivery' button");
  console.log("  2. TEST-NON-ACTIONABLE order should have 'Non-Actionable' badge");
  console.log("\nTo cleanup test data, run:");
  console.log("  npx tsx scripts/create_dummy_ndr.ts --cleanup");
  console.log("=".repeat(60));
}

const args = process.argv.slice(2);
if (args.includes("--cleanup")) {
  cleanup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error during cleanup:", err);
      process.exit(1);
    });
} else {
  createTestData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error creating test data:", err);
      process.exit(1);
    });
}

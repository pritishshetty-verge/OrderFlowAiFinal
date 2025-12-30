/**
 * Test script to verify Delhivery webhook endpoint is working
 * Run with: npx tsx scripts/test-webhook.ts
 */

const BASE_URL = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
  : 'http://localhost:5000';

// Sample Delhivery NDR payload based on their documentation
const sampleNDRPayload = {
  Awb: "TEST-AWB-WEBHOOK",
  ScanCode: "CR", // Customer Refused - an NDR status
  Scan: "Customer Refused",
  Status: "NDR",
  StatusCode: "CR",
  Remarks: "Customer refused to accept delivery - test webhook",
  ScanDateTime: new Date().toISOString(),
  DestinationCity: "DELHI",
  DestinationState: "DELHI",
  ConsigneeName: "Test Customer",
  ConsigneePhone: "9999999999",
  ReferenceNo: "TEST-ORDER-123",
};

async function testWebhook() {
  console.log("=".repeat(60));
  console.log("Testing Delhivery Webhook Endpoint");
  console.log("=".repeat(60));
  console.log(`\nTarget URL: ${BASE_URL}/api/webhooks/delhivery`);
  console.log("\nPayload being sent:");
  console.log(JSON.stringify(sampleNDRPayload, null, 2));
  console.log("\n" + "-".repeat(60));

  try {
    const response = await fetch(`${BASE_URL}/api/webhooks/delhivery`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sampleNDRPayload),
    });

    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }

    console.log(`\nResponse Status: ${response.status} ${response.statusText}`);
    console.log("Response Body:");
    console.log(JSON.stringify(responseBody, null, 2));

    if (response.status === 200) {
      console.log("\n✅ SUCCESS: Webhook endpoint received and processed the payload");
      console.log("   Check ndr_events table for new row with AWB: TEST-AWB-WEBHOOK");
    } else if (response.status === 404) {
      console.log("\n⚠️  EXPECTED: 404 - Shipment not found for test AWB");
      console.log("   This is normal for testing. The endpoint is working correctly.");
      console.log("   When Delhivery sends real webhooks with valid AWBs, NDR events will be created.");
    } else {
      console.log("\n❌ UNEXPECTED: Check the response and server logs for details");
    }
  } catch (error: any) {
    console.error("\n❌ ERROR: Failed to reach webhook endpoint");
    console.error("   Error:", error.message);
    console.error("   Make sure the server is running on port 5000");
  }

  console.log("\n" + "=".repeat(60));
}

testWebhook();

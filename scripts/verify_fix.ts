import pg from "pg";
const { Client } = pg;

async function main() {
  console.log("🔌 Connecting to Production Database...");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // 1. SEARCH: Count bad orders
  const checkSql = `
    SELECT count(*) as count 
    FROM orders 
    WHERE assigned_to IS NOT NULL 
    AND financial_status = 'paid'
    AND (payment_method ILIKE '%cod%' OR payment_method ILIKE '%cash%')
    AND confirmed_at > (created_at + INTERVAL '5 days');
  `;

  const resBefore = await client.query(checkSql);
  const badCount = parseInt(resBefore.rows[0].count);
  console.log(`🧐 Found ${badCount} 'Fake Win' orders currently in the DB.`);

  // 2. DESTROY: If found, wipe them out
  if (badCount > 0) {
    console.log("🧹 Running Cleanup...");
    const updateSql = `
        UPDATE orders 
        SET assigned_to = NULL 
        WHERE assigned_to IS NOT NULL 
        AND financial_status = 'paid'
        AND (payment_method ILIKE '%cod%' OR payment_method ILIKE '%cash%')
        AND confirmed_at > (created_at + INTERVAL '5 days');
    `;
    await client.query(updateSql);

    // 3. VERIFY
    const resAfter = await client.query(checkSql);
    console.log(`✅ Cleanup Done! Remaining bad orders: ${resAfter.rows[0].count}`);
  } else {
    console.log("👍 The Database is ALREADY clean!");
  }

  await client.end();
}

main().catch(err => console.error("❌ Error:", err));
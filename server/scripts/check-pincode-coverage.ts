import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
(async () => {
  const r: any = await db.execute(sql`
    SELECT COUNT(*)::int4 AS total,
           COUNT(*) FILTER (WHERE city IS NOT NULL)::int4 AS with_city,
           COUNT(DISTINCT state)::int4 AS distinct_states
    FROM pincode_tiers`);
  console.log((r.rows ?? r)[0]);
  const sample: any = await db.execute(sql`
    SELECT pincode, city, state FROM pincode_tiers WHERE city IS NOT NULL LIMIT 3`);
  for (const row of sample.rows ?? sample) console.log(" ", row);
  process.exit(0);
})();

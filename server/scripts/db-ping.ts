import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";

(async () => {
  try {
    const r: any = await db.execute(sql`SELECT 1 AS ok, now() AS ts`);
    console.log("DB OK:", JSON.stringify((r.rows ?? r)[0]));
    process.exit(0);
  } catch (e: any) {
    console.error("DB FAIL:", e?.message ?? e);
    process.exit(1);
  }
})();

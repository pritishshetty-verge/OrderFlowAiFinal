import "dotenv/config";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { resolve } from "path";

// Apply a single SQL migration file passed as argv[2]. Idempotent
// migrations (IF NOT EXISTS) are safe to re-run.
(async () => {
  const file = process.argv[2];
  if (!file) { console.error("usage: tsx apply-migration.ts <path-to-sql>"); process.exit(1); }
  const text = readFileSync(resolve(file), "utf8");
  await db.execute(sql.raw(text));
  console.log(`Applied: ${file}`);
  process.exit(0);
})().catch((e) => { console.error("FAIL:", e?.message ?? e); process.exit(1); });

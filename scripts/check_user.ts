import "dotenv/config";
import { db, pool } from "../server/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const u = await db
    .select({ email: users.email, role: users.role, isActive: users.isActive, fullName: users.fullName })
    .from(users)
    .where(eq(users.email, "nandakishore@vergescales.com"));
  console.log(u[0] ?? "NOT FOUND");
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });

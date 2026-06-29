/**
 * Grant Reconciliation page access to a user by email.
 *
 * Two stages:
 *   1. Show the user's current role/adminType/isActive
 *   2. If they're not already admin/full_control, promote them
 *
 * Usage: npx tsx scripts/grant_recon_access.ts <email>
 */
import "dotenv/config";
import { db, pool } from "../server/db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2] ?? "nandakishore@vergescales.com";

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      adminType: users.adminType,
      isActive: users.isActive,
      department: users.department,
    })
    .from(users)
    .where(eq(users.email, email));

  if (!user) {
    console.error(`\n✗ No user found with email ${email}`);
    console.log("\nListing first 20 users so you can find yours:");
    const all = await db
      .select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role })
      .from(users)
      .limit(20);
    for (const u of all) {
      console.log(`  ${u.role.padEnd(15)} ${u.email.padEnd(40)} ${u.fullName}`);
    }
    await pool.end();
    process.exit(1);
  }

  console.log("\n=== Current ===");
  console.log(`  email:      ${user.email}`);
  console.log(`  fullName:   ${user.fullName}`);
  console.log(`  role:       ${user.role}`);
  console.log(`  adminType:  ${user.adminType ?? "(null)"}`);
  console.log(`  isActive:   ${user.isActive}`);

  if (user.role === "admin" && user.adminType === "full_control" && user.isActive) {
    console.log("\n✓ Already an active admin · full_control. No change needed.");
    console.log("  If you can't see /reconciliation, the issue may be your browser's");
    console.log("  localStorage `userRole` is stale. Log out + log back in to refresh.");
    await pool.end();
    return;
  }

  console.log("\n=== Promoting to admin · full_control ===");
  const [updated] = await db
    .update(users)
    .set({
      role: "admin",
      adminType: "full_control",
      isActive: true,
      // Don't overwrite permissions JSONB — full_control admins get
      // everything implicitly anyway (the AdminOnlyGuard doesn't read
      // the JSONB for full_control).
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning({
      role: users.role,
      adminType: users.adminType,
      isActive: users.isActive,
    });

  console.log(`  role:      ${updated.role}`);
  console.log(`  adminType: ${updated.adminType}`);
  console.log(`  isActive:  ${updated.isActive}`);
  console.log("\n✓ Done. IMPORTANT: log out + log back in to refresh your");
  console.log("  browser's localStorage `userRole`. The route guard reads from there.");

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

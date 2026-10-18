/**
 * Password hashing/verification contract for server/auth.ts.
 *
 * Locks in: only bcrypt-shaped stored values can verify. A plaintext
 * stored value — the pre-cutover format — must fail, so the removed
 * legacy compare cannot quietly come back.
 *
 * Run: `npm test` (Node's built-in test runner via tsx — no extra deps).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, isBcryptHash } from "./auth";

const PASSWORD = "correct horse battery staple";
let hash: string;

test.before(async () => {
  hash = await hashPassword(PASSWORD);
});

test("hashPassword emits a bcrypt-shaped 60-char hash", () => {
  assert.equal(hash.length, 60);
  assert.ok(isBcryptHash(hash));
});

test("correct password verifies against its hash", async () => {
  assert.equal(await verifyPassword(PASSWORD, hash), true);
});

test("wrong password fails", async () => {
  assert.equal(await verifyPassword("not it", hash), false);
});

test("plaintext stored value never verifies (legacy path is gone)", async () => {
  assert.equal(await verifyPassword(PASSWORD, PASSWORD), false);
});

test("empty / missing inputs fail without throwing", async () => {
  assert.equal(await verifyPassword("", hash), false);
  assert.equal(await verifyPassword(PASSWORD, null), false);
  assert.equal(await verifyPassword(PASSWORD, undefined), false);
  assert.equal(await verifyPassword(PASSWORD, ""), false);
});

test("malformed bcrypt-looking value fails cleanly", async () => {
  const decoy = "$2b$12$0000000000000000000000000000000000000000000000000000Q";
  assert.equal(await verifyPassword(PASSWORD, decoy), false);
});

test("isBcryptHash recognises the $2a/$2b/$2y family only", () => {
  assert.ok(isBcryptHash("$2a$10$" + "x".repeat(53)));
  assert.ok(isBcryptHash("$2y$12$" + "x".repeat(53)));
  assert.equal(isBcryptHash("plaintext"), false);
  assert.equal(isBcryptHash("$1$notbcrypt"), false);
  assert.equal(isBcryptHash(null), false);
});

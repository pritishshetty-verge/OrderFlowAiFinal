import bcrypt from "bcryptjs";

// ─────────────────────────────────────────────────────────────────────
// Password hashing + verification.
//
// We use bcryptjs (pure-JS implementation) instead of native bcrypt
// because:
//   - Vercel's serverless runtime cannot ship native bindings
//     reliably; bcrypt's node-gyp build fails or pulls a mismatched
//     binary on cold-start. bcryptjs is ~3x slower but has zero
//     native deps and runs identically on every platform.
//   - Hash format is identical ($2a$ / $2b$ / $2y$ — bcryptjs reads
//     bcrypt-emitted hashes and vice versa), so a future migration
//     to native bcrypt is a drop-in swap.
//
// Cost factor 12 is the 2024-recommended baseline (~250ms per hash on
// Vercel's Node 20 runtime). Higher = slower at login but harder to
// brute-force. Drop to 10 only if cold-start latency becomes the
// bottleneck.
// ─────────────────────────────────────────────────────────────────────

export const BCRYPT_COST = 12;

/**
 * Hash a plaintext password. Returns a bcrypt-formatted string starting
 * with `$2b$<cost>$<22-char-salt><31-char-hash>` (60 chars total). Safe
 * to write directly to users.password.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("hashPassword: empty or non-string input");
  }
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * Detect whether a stored password value is bcrypt-shaped ($2a$ / $2b$ /
 * $2y$ prefix family). verifyPassword uses it as a guard so a malformed
 * or non-hash stored value fails verification cleanly instead of making
 * bcrypt.compare throw on an invalid salt.
 */
export function isBcryptHash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}

/**
 * Verify a plaintext password against a stored bcrypt hash.
 *
 * Only bcrypt-shaped values can verify. The transitional plaintext
 * compare that carried the original rows through the bcrypt cutover was
 * removed once an audit confirmed every users.password value is a
 * bcrypt hash (7/7 rows, 2026-10-18); a plaintext stored value now
 * always fails.
 */
export async function verifyPassword(
  plaintext: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored || typeof plaintext !== "string" || plaintext.length === 0) {
    return false;
  }
  if (!isBcryptHash(stored)) return false;
  return bcrypt.compare(plaintext, stored);
}

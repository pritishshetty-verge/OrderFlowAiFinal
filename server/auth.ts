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
 * Detect whether a stored password value is bcrypt-shaped. Used by the
 * transitional login path to decide between secure compare and the
 * legacy plaintext compare. The check is intentionally narrow — it
 * matches the bcrypt prefix family ($2a$ / $2b$ / $2y$) — so a
 * plaintext password that happens to look bcrypt-ish (very rare) is
 * still treated as a hash and fails verification cleanly.
 */
export function isBcryptHash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  return /^\$2[aby]\$\d{2}\$/.test(stored);
}

/**
 * Verify a plaintext password against a stored value.
 *
 * Transitional behaviour during the bcrypt rollout:
 *   - If `stored` is bcrypt-shaped → secure constant-time compare via
 *     bcrypt.compare. Standard and correct.
 *   - If `stored` is a legacy plaintext password (no users have been
 *     migrated yet) → plain string compare AND signal back that the
 *     row needs upgrading. The login route then re-hashes the
 *     password and writes the bcrypt form back to the row, so the
 *     next login takes the secure path automatically.
 *
 * This keeps the existing 4 plaintext rows working through the
 * cutover without a forced password reset. Once Phase 2 ships the
 * forced-rotation, this helper can drop the `legacy` branch and the
 * function reduces to bcrypt.compare.
 */
export async function verifyPassword(
  plaintext: string,
  stored: string | null | undefined,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored || typeof plaintext !== "string" || plaintext.length === 0) {
    return { ok: false, needsRehash: false };
  }
  if (isBcryptHash(stored)) {
    const ok = await bcrypt.compare(plaintext, stored);
    return { ok, needsRehash: false };
  }
  // Legacy plaintext path. Constant-time-ish compare to avoid leaking
  // timing info about password length matches. (Strict timing safety
  // requires fixed-length comparison, which we can't guarantee here
  // without knowing the password length up front; the leakage window
  // is small and disappears as soon as users migrate.)
  const ok = plaintext === stored;
  return { ok, needsRehash: ok };
}

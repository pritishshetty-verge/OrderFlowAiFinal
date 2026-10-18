/**
 * In-memory sliding-window rate limiting for the public storefront lookups.
 *
 * NOTE: each warm serverless instance on Vercel keeps its own memory, so these
 * counters are per-instance, not global. That's acceptable for the current
 * threat model (casual scraping / enumeration of the public lookups); the limit
 * is a speed bump, not a hard quota. Move to Redis or a DB-backed counter if we
 * ever need cluster-wide accuracy.
 */

import type { Request } from "express";

interface Window {
  /** Timestamps (ms) of the hits currently inside the window. */
  hits: number[];
}

export class SlidingWindowLimiter {
  private readonly windows = new Map<string, Window>();

  /**
   * @param limit     max hits allowed per key within the window
   * @param windowMs  window length in milliseconds
   */
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Drop timestamps that have aged out of the window. */
  private prune(hits: number[], now: number): number[] {
    const cutoff = now - this.windowMs;
    // tsc target rejects for..of over arrays here in some configs; filter is safe.
    return hits.filter((t: number) => t > cutoff);
  }

  /**
   * Record a hit for `key`. Returns whether it is allowed, and (when blocked)
   * how many seconds until the oldest in-window hit expires.
   */
  hit(key: string): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const existing = this.windows.get(key)?.hits ?? [];
    const recent = this.prune(existing, now);

    if (recent.length >= this.limit) {
      // Blocked: don't record this attempt. Retry-After = time until the
      // oldest in-window hit falls off.
      const oldest = recent[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      this.windows.set(key, { hits: recent });
      return { allowed: false, retryAfterSec };
    }

    recent.push(now);
    this.windows.set(key, { hits: recent });
    return { allowed: true, retryAfterSec: 0 };
  }

  /** True if `key` is currently at/over the limit. Does NOT record a hit. */
  isBlocked(key: string): boolean {
    const now = Date.now();
    const recent = this.prune(this.windows.get(key)?.hits ?? [], now);
    // Persist the pruned window so memory doesn't grow unbounded.
    if (recent.length > 0) this.windows.set(key, { hits: recent });
    else this.windows.delete(key);
    return recent.length >= this.limit;
  }
}

/** Best-effort client IP: first X-Forwarded-For hop, then X-Real-IP, then req.ip. */
export function clientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  const xffFirst = Array.isArray(xff) ? xff[0] : xff;
  if (xffFirst) {
    const first = xffFirst.split(",")[0]?.trim();
    if (first) return first;
  }
  const xReal = req.headers["x-real-ip"];
  const xRealVal = Array.isArray(xReal) ? xReal[0] : xReal;
  if (xRealVal && xRealVal.trim()) return xRealVal.trim();
  return req.ip || "unknown";
}

// ── Shared limiters (module singletons) ──────────────────────────────────────

/** Per IP: 20 lookups per minute across all public lookup endpoints. */
export const perIpLimiter = new SlidingWindowLimiter(20, 60_000);

/**
 * Wrong-contact: 6 failed email/phone attempts per (store, order number) per
 * 15 minutes. Only failures are counted (call .hit on a verification miss).
 */
export const wrongContactLimiter = new SlidingWindowLimiter(6, 15 * 60_000);

/** Build the wrong-contact key from store + order number. */
export function wrongContactKey(storeId: string | null | undefined, orderNumber: string): string {
  return `${storeId ?? "default"}::${orderNumber}`;
}

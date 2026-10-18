import { test } from "node:test";
import assert from "node:assert/strict";
import { SlidingWindowLimiter, clientIp } from "./publicRateLimit";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("blocks once the limit is reached and reports a retry-after", () => {
  const l = new SlidingWindowLimiter(2, 10_000);
  assert.equal(l.hit("k").allowed, true);
  assert.equal(l.hit("k").allowed, true);
  const third = l.hit("k");
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSec >= 1);
});

test("resets after the window elapses", async () => {
  const l = new SlidingWindowLimiter(1, 40);
  assert.equal(l.hit("k").allowed, true);
  assert.equal(l.hit("k").allowed, false);
  await sleep(70);
  assert.equal(l.hit("k").allowed, true);
});

test("keys are independent", () => {
  const l = new SlidingWindowLimiter(1, 10_000);
  assert.equal(l.hit("a").allowed, true);
  assert.equal(l.hit("b").allowed, true); // different key, own budget
  assert.equal(l.hit("a").allowed, false);
});

test("isBlocked does not consume a hit", () => {
  const l = new SlidingWindowLimiter(1, 10_000);
  assert.equal(l.isBlocked("k"), false);
  assert.equal(l.isBlocked("k"), false); // repeated checks don't count
  assert.equal(l.hit("k").allowed, true); // first real hit still available
  assert.equal(l.isBlocked("k"), true); // now at the limit
  assert.equal(l.hit("k").allowed, false);
});

test("clientIp prefers x-forwarded-for, then x-real-ip, then req.ip", () => {
  assert.equal(
    clientIp({ headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" }, ip: "9.9.9.9" } as any),
    "1.1.1.1",
  );
  assert.equal(clientIp({ headers: { "x-real-ip": "3.3.3.3" }, ip: "9.9.9.9" } as any), "3.3.3.3");
  assert.equal(clientIp({ headers: {}, ip: "9.9.9.9" } as any), "9.9.9.9");
});

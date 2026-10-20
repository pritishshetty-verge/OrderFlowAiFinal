/**
 * Contract for the `unknown`-error helpers used by route catch blocks.
 *
 * Run: `npm test` (Node's built-in test runner via tsx — no extra deps).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { errorMessage, errorCode } from "./errors";

test("errorMessage: Error instances and subclasses", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage(new TypeError("bad type")), "bad type");
  assert.equal(errorMessage(new Error("")), "");
});

test("errorMessage: strings pass through", () => {
  assert.equal(errorMessage("plain"), "plain");
});

test("errorMessage: plain objects with a string message", () => {
  assert.equal(errorMessage({ message: "from object" }), "from object");
  assert.equal(errorMessage({ message: 42 }), "[object Object]");
});

test("errorMessage: everything else is stringified", () => {
  assert.equal(errorMessage(undefined), "undefined");
  assert.equal(errorMessage(null), "null");
  assert.equal(errorMessage(7), "7");
});

test("errorCode: string code only", () => {
  const e = Object.assign(new Error("timeout"), { code: "ECONNABORTED" });
  assert.equal(errorCode(e), "ECONNABORTED");
  assert.equal(errorCode({ code: 500 }), undefined);
  assert.equal(errorCode(new Error("x")), undefined);
  assert.equal(errorCode("str"), undefined);
  assert.equal(errorCode(null), undefined);
});

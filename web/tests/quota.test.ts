import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateUsage, parseDailyCap, usageKey } from "../src/lib/quota.ts";

test("parseDailyCap uses the default when unset or empty", () => {
  assert.equal(parseDailyCap(undefined), 5);
  assert.equal(parseDailyCap(""), 5);
  assert.equal(parseDailyCap("  "), 5);
});

test("parseDailyCap accepts positive whole numbers", () => {
  assert.equal(parseDailyCap("1"), 1);
  assert.equal(parseDailyCap("12"), 12);
});

test("parseDailyCap rejects values that would disable or break the cap", () => {
  for (const bad of ["abc", "NaN", "0", "-3", "2.5", "Infinity"]) {
    assert.equal(parseDailyCap(bad), 5, bad);
  }
  assert.equal(parseDailyCap("abc", 3), 3);
});

test("usageKey is per user and per UTC day", () => {
  const late = new Date("2026-10-03T23:59:59Z");
  const next = new Date("2026-10-04T00:00:00Z");
  assert.equal(usageKey("a@x.com", late), "usage:a@x.com:2026-10-03");
  assert.equal(usageKey("a@x.com", next), "usage:a@x.com:2026-10-04");
  assert.notEqual(usageKey("a@x.com", late), usageKey("b@x.com", late));
});

test("evaluateUsage allows up to the cap and blocks after it", () => {
  assert.deepEqual(evaluateUsage(1, 5, "k"), { allowed: true, used: 1, cap: 5, key: "k" });
  assert.equal(evaluateUsage(5, 5).allowed, true);
  assert.equal(evaluateUsage(6, 5).allowed, false);
});

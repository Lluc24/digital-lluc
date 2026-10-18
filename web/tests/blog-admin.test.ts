import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidSlug, normalizeDate, toPostMeta } from "../src/lib/blog-meta.ts";
import { isAdminEmail } from "../src/lib/admin-check.ts";

test("isValidSlug accepts normal post names", () => {
  for (const ok of ["why-voice", "epfl-exchange-lausanne", "post_2", "A1"]) {
    assert.equal(isValidSlug(ok), true, ok);
  }
});

test("isValidSlug rejects anything that could leave content/blog", () => {
  for (const bad of ["", "..", "../README", "a/b", "a\\b", ".hidden", "x.md", "a b", "a\0b", "-lead"]) {
    assert.equal(isValidSlug(bad), false, JSON.stringify(bad));
  }
});

test("normalizeDate keeps strings and turns Dates into YYYY-MM-DD", () => {
  assert.equal(normalizeDate("2026-08-05"), "2026-08-05");
  assert.equal(normalizeDate(new Date("2026-08-09T00:00:00Z")), "2026-08-09");
  assert.equal(normalizeDate(new Date("nope")), "");
  assert.equal(normalizeDate(undefined), "");
  assert.equal(normalizeDate(20260805), "");
});

test("toPostMeta never returns non-string fields", () => {
  const meta = toPostMeta("p", { title: 42, date: new Date("2026-01-02T00:00:00Z"), summary: { a: 1 } });
  assert.deepEqual(meta, { slug: "p", title: "p", date: "2026-01-02", summary: undefined });
  assert.deepEqual(toPostMeta("p", { title: "T", date: "2026-01-02", summary: "S" }), {
    slug: "p",
    title: "T",
    date: "2026-01-02",
    summary: "S",
  });
});

test("isAdminEmail ignores case and spaces", () => {
  assert.equal(isAdminEmail("Me@Example.com", " me@example.com "), true);
  assert.equal(isAdminEmail("other@example.com", "me@example.com"), false);
});

test("isAdminEmail never matches when either side is empty", () => {
  assert.equal(isAdminEmail("me@example.com", undefined), false);
  assert.equal(isAdminEmail("me@example.com", "  "), false);
  assert.equal(isAdminEmail(undefined, "me@example.com"), false);
  assert.equal(isAdminEmail("", ""), false);
});

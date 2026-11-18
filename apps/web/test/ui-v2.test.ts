import { test } from "node:test";
import assert from "node:assert/strict";
import { v2Rewrite, sectionFor, safeNext, parseTheme } from "../src/lib/uiV2";

test("v2 rewrites only the routes the new design covers", () => {
  assert.equal(v2Rewrite("/aircraft/abc"), "/v2/aircraft/abc");
  assert.equal(v2Rewrite("/aircraft/abc/status"), "/v2/aircraft/abc/status");
  assert.equal(v2Rewrite("/aircraft/abc/logbooks/"), "/v2/aircraft/abc/logbooks");
  assert.equal(v2Rewrite("/aircraft/abc/documents"), "/v2/aircraft/abc/documents");
  assert.equal(v2Rewrite("/aircraft/abc/status/item/mx:1"), null, "deeper screens stay v1 until built");
  assert.equal(v2Rewrite("/aircraft/abc/review"), null);
  assert.equal(v2Rewrite("/aircraft/enroll"), null);
  assert.equal(v2Rewrite("/dashboard"), null);
  assert.equal(v2Rewrite("/r/token"), null);
});

test("sections follow the binder tabs", () => {
  assert.equal(sectionFor("logbooks"), "books");
  assert.equal(sectionFor("weight-balance"), "aircraft");
  assert.equal(sectionFor("ask"), "books");
  assert.equal(sectionFor("nope"), null);
});

test("opt-in redirect only follows same-origin paths", () => {
  assert.equal(safeNext("/aircraft/1/status"), "/aircraft/1/status");
  assert.equal(safeNext("//evil.example"), "/dashboard");
  assert.equal(safeNext("/\\evil.example"), "/dashboard");
  assert.equal(safeNext("https://evil.example"), "/dashboard");
  assert.equal(safeNext(null, "/x"), "/x");
  assert.equal(parseTheme("dark"), "dark");
  assert.equal(parseTheme("blue"), "system");
});

import { railTabs, type RailCounts } from "../src/lib/v2/rail";

const counts: RailCounts = {
  overdue: 1, dueSoon: 3, pages: 412, booksWithPages: 5, confirmedEntries: 212, toReview: 6,
  trackedItems: 11, openSquawks: 2, toAnswer: 0, documents: 14, liveLinks: 1, people: 2,
};

test("rail tab lines follow 03 §13", () => {
  const tabs = railTabs("a1", counts, true);
  assert.deepEqual(tabs.map((t) => t.label), ["Status", "Logbooks", "Maintenance", "Aircraft", "Documents", "Share"]);
  assert.deepEqual(tabs[0].lines, ["1 overdue, 3 soon"]);
  assert.deepEqual(tabs[1].lines, ["412 pages in 5 books", "212 entries"]);
  assert.equal(tabs[1].flag, "6 to review");
  assert.deepEqual(tabs[2].lines, ["11 tracked items", "2 open squawks"]);
  assert.deepEqual(tabs[4].lines, ["14 in the vault"]);
  assert.deepEqual(tabs[5].lines, ["1 link live"]);
  assert.ok(tabs[1].weight > tabs[0].weight, "logbooks holds the most");
});

test("rail zero and role cases", () => {
  const empty = railTabs("a1", { ...counts, overdue: 0, dueSoon: 0, pages: 0, toReview: 0, openSquawks: 0, documents: 0, liveLinks: 0 }, false);
  assert.deepEqual(empty[1].lines, ["No pages yet", "Add the first book"]);
  assert.equal(empty[1].flag, undefined);
  assert.deepEqual(empty[2].lines, ["11 tracked items", "No open squawks"]);
  assert.deepEqual(empty[4].lines, ["Nothing filed yet"]);
  assert.deepEqual(empty[5].lines, ["Dossier and summary"], "non-owners see the dossier line");
  assert.deepEqual(railTabs("a1", { ...counts, overdue: null }, true)[0].lines, [], "a failed count drops the line");
});

test("opt-in redirect uses the public site URL, not the container address", async () => {
  const { GET } = await import("../src/app/api/ui/route");
  const { NextRequest } = await import("next/server");
  const prev = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://mfb-test.mytaillog.com";
  try {
    const res = await GET(new NextRequest("http://0.0.0.0:8080/api/ui?design=v2&next=/dashboard"));
    assert.equal(res.headers.get("location"), "https://mfb-test.mytaillog.com/dashboard");
    assert.match(res.headers.get("set-cookie") ?? "", /mtl_ui=v2/);
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prev;
  }
});

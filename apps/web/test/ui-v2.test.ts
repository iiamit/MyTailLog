import { test } from "node:test";
import assert from "node:assert/strict";
import { v2Rewrite, sectionFor, safeNext, parseTheme, wantsV2, UI_V2_DEFAULT, v1ToV2, v2ToV1 } from "../src/lib/uiV2";

test("v2 rewrites only the routes the new design covers", () => {
  assert.equal(v2Rewrite("/aircraft/abc"), "/v2/aircraft/abc");
  assert.equal(v2Rewrite("/aircraft/abc/status"), "/v2/aircraft/abc/status");
  assert.equal(v2Rewrite("/aircraft/abc/logbooks/"), "/v2/aircraft/abc/logbooks");
  assert.equal(v2Rewrite("/aircraft/abc/documents"), "/v2/aircraft/abc/documents");
  assert.equal(v2Rewrite("/aircraft/abc/status/item/mx:1"), "/v2/aircraft/abc/status/item/mx:1");
  assert.equal(v2Rewrite("/aircraft/abc/status/item/"), null, "an item route needs its key");
  assert.equal(v2Rewrite("/aircraft/abc/status/plan"), "/v2/aircraft/abc/status/plan");
  assert.equal(v2Rewrite("/aircraft/abc/share/dossier"), "/v2/aircraft/abc/share/dossier");
  assert.equal(v2Rewrite("/aircraft/abc/share/summary"), "/v2/aircraft/abc/share/summary");
  assert.equal(v2Rewrite("/aircraft/abc/share/other"), null, "deeper screens stay v1 until built");
  assert.equal(v2Rewrite("/aircraft/abc/status/forecast"), null);
  assert.equal(v2Rewrite("/aircraft/abc/logbooks/pages"), "/v2/aircraft/abc/logbooks/pages");
  assert.equal(v2Rewrite("/aircraft/abc/logbooks/add"), "/v2/aircraft/abc/logbooks/add");
  assert.equal(v2Rewrite("/aircraft/abc/ask"), "/v2/aircraft/abc/ask");
  assert.equal(v2Rewrite("/aircraft/abc/logbooks/entries/new"), "/v2/aircraft/abc/logbooks/entries/new");
  assert.equal(v2Rewrite("/aircraft/abc/review"), null);
  for (const p of ["maintenance/items", "maintenance/ads", "maintenance/ads/find", "maintenance/squawks", "maintenance/annual",
    "maintenance/records-check", "hours", "oil", "equipment", "weight-balance", "details"])
    assert.equal(v2Rewrite(`/aircraft/abc/${p}`), `/v2/aircraft/abc/${p}`, p);
  assert.equal(v2Rewrite("/aircraft/abc/maintenance/nope"), null);
  assert.equal(v2Rewrite("/aircraft/abc/meters"), null, "v1-only paths keep rendering v1");
  assert.equal(v2Rewrite("/aircraft/enroll"), null);
  assert.equal(v2Rewrite("/dashboard"), null);
  assert.equal(v2Rewrite("/r/token"), null);
});

test("the new design is the default; a browser's own choice wins", () => {
  assert.equal(wantsV2(undefined, true), true);
  assert.equal(wantsV2("v1", true), false, "Switch back keeps v1");
  assert.equal(wantsV2("v2", false), true, "Try the new design still works when the default is flipped off");
  assert.equal(wantsV2(undefined, false), false);
  assert.equal(UI_V2_DEFAULT, true);
});

test("account-level and setup screens live in the v2 tree", () => {
  for (const p of ["/hangar", "/account", "/account/settings", "/account/data", "/aircraft/new", "/aircraft/abc/setup"])
    assert.equal(v2Rewrite(p), `/v2${p}`, p);
  assert.equal(v2Rewrite("/account-deletion"), null);
  assert.equal(v2Rewrite("/account/other"), null);
});

test("today's routes move to their v2 homes (03 §10)", () => {
  const q = (s = "") => new URLSearchParams(s);
  assert.equal(v1ToV2("/dashboard", q()), "/hangar");
  assert.equal(v1ToV2("/profile", q()), "/account/settings");
  assert.equal(v1ToV2("/profile/credentials", q()), "/account/settings#signing");
  assert.equal(v1ToV2("/aircraft/enroll", q()), "/aircraft/new");
  assert.equal(v1ToV2("/aircraft/a/start", q()), null, "v1 setup keeps its inline annual read");
  assert.equal(v1ToV2("/aircraft/a/compliance", q()), "/aircraft/a/maintenance/ads");
  assert.equal(v1ToV2("/aircraft/a/compliance/explore", q()), "/aircraft/a/maintenance/ads/find");
  assert.equal(v1ToV2("/aircraft/a/meters/", q()), "/aircraft/a/hours");
  assert.equal(v1ToV2("/aircraft/a/capture", q("logbook=x")), "/aircraft/a/logbooks/add?capture=1");
  assert.equal(v1ToV2("/aircraft/a/pages/p1/review", q()), "/aircraft/a/logbooks/review/p1");
  assert.equal(v1ToV2("/aircraft/a/entries/e1", q()), "/aircraft/a/logbooks/entries/e1");
  assert.equal(v1ToV2("/aircraft/a/entries/new", q("corrects=e1")), "/aircraft/a/logbooks/entries/new?corrects=e1");
  assert.equal(v1ToV2("/aircraft/a/timeline", q("entry=e1")), "/aircraft/a/logbooks/map?stop=e1");
  assert.equal(v1ToV2("/aircraft/a/timeline", q()), "/aircraft/a/logbooks/map");
  assert.equal(v1ToV2("/aircraft/a/audit", q()), "/aircraft/a/maintenance/records-check");
  assert.equal(v1ToV2("/aircraft/a/export", q()), "/account/data?aircraft=a#export");
  for (const p of ["/aircraft/a/import", "/aircraft/a/ask", "/aircraft/a/status", "/aircraft/a",
    "/r/token", "/r/token/page/p", "/m/token", "/help", "/"])
    assert.equal(v1ToV2(p, q()), null, `${p} is unchanged or still v1`);
  // Every destination is a route the v2 tree serves.
  for (const p of ["/aircraft/a/compliance", "/aircraft/a/squawks", "/aircraft/a/upload", "/aircraft/a/pages", "/aircraft/a/review",
    "/aircraft/a/oil-analysis", "/aircraft/a/duplicates", "/aircraft/a/annual", "/aircraft/a/summary", "/aircraft/a/prebuy", "/profile"]) {
    const to = v1ToV2(p, q())!;
    assert.ok(v2Rewrite(to.split(/[?#]/)[0]), `${p} → ${to} is served by v2`);
  }
});

test("owners who switched back are sent from new-only URLs to their v1 page", () => {
  const q = (s = "") => new URLSearchParams(s);
  assert.equal(v2ToV1("/hangar", q()), "/dashboard");
  assert.equal(v2ToV1("/account/settings", q()), "/profile");
  assert.equal(v2ToV1("/account/data", q("aircraft=a")), "/aircraft/a/export");
  assert.equal(v2ToV1("/aircraft/new", q()), "/aircraft/enroll");
  assert.equal(v2ToV1("/aircraft/a/setup", q()), "/aircraft/a/start");
  assert.equal(v2ToV1("/aircraft/a/status", q()), null);
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
    const back = await GET(new NextRequest("http://0.0.0.0:8080/api/ui?design=v1&next=/dashboard"));
    assert.match(back.headers.get("set-cookie") ?? "", /mtl_ui=v1;/, "Switch back pins v1; no cookie now means v2");
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = prev;
  }
});

test("notification deep links open the matching web route (03 §10.3)", async () => {
  const { appLinkToWeb } = await import("../src/ui/NotificationInbox");
  assert.equal(appLinkToWeb("mytaillog://aircraft/a1/status/item/mx:9"), "/aircraft/a1/status/item/mx:9");
  assert.equal(appLinkToWeb("mytaillog://aircraft/a1/status/visit/v1"), "/aircraft/a1/status/plan?visit=v1");
  assert.equal(appLinkToWeb("https://mytaillog.com/app/aircraft/a1/books/map?at=2020-05-01"), "/aircraft/a1/logbooks/map?from=2018-05-01&to=2022-05-01");
  assert.equal(appLinkToWeb("/app/aircraft/a1/books/entry/e1"), "/aircraft/a1/logbooks/entries/e1");
  assert.equal(appLinkToWeb("mytaillog://aircraft/a1/maint/squawk/s1"), "/aircraft/a1/maintenance/squawks?squawk=s1");
  assert.equal(appLinkToWeb("mytaillog://aircraft/a1/books/review?batch=b1"), "/aircraft/a1/logbooks/review?batch=b1");
  assert.equal(appLinkToWeb("mytaillog://aircraft/a1/whatever"), "/aircraft/a1/status");
  assert.equal(appLinkToWeb("mytaillog://settings"), "/hangar");
  assert.equal(appLinkToWeb(null), "/hangar");
});

test("g then a letter goes to a section of this aircraft, g t to the hangar (03 §8)", async () => {
  const { goTarget } = await import("../src/ui/Shortcuts");
  assert.equal(goTarget("/aircraft/a1/maintenance/squawks", "s"), "/aircraft/a1/status");
  assert.equal(goTarget("/v2/aircraft/a1/status", "L"), "/aircraft/a1/logbooks");
  assert.equal(goTarget("/aircraft/a1/status", "h"), "/aircraft/a1/share");
  assert.equal(goTarget("/hangar", "t"), "/hangar");
  assert.equal(goTarget("/hangar", "s"), null, "no aircraft, no section");
  assert.equal(goTarget("/aircraft/new", "s"), null);
  assert.equal(goTarget("/aircraft/a1/status", "z"), null);
});

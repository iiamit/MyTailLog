import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, buildMapModel, stopId, todayIn, type MapEntry } from "../src/lib/mapModel";

const logbooks = [
  { id: "lb-eng", type: "engine" as const },
  { id: "lb-air", type: "airframe" as const },
  { id: "lb-oth", type: "other" as const },
];
const e = (id: string, logbook_id: string, entry_date: string | null, trust: MapEntry["trust"], extra: Partial<MapEntry> = {}): MapEntry =>
  ({ id, logbook_id, page_id: `p-${id}`, entry_date, trust, replaced_by_entry_id: null, is_continuation: false, ...extra });

const entries = [
  e("1", "lb-air", "2024-12-03", "signed"),
  e("2", "lb-air", "2024-12-03", "ai_read", { page_id: "p-1" }),
  e("3", "lb-eng", "2024-12-03", "confirmed"),
  e("4", "lb-air", "2020-05-01", "confirmed"),
  e("5", "lb-air", null, "confirmed"),
  e("6", "lb-air", "2025-01-01", "confirmed", { replaced_by_entry_id: "1" }),
  e("7", "lb-air", "2025-02-01", "confirmed", { is_continuation: true }),
  e("8", "lb-oth", "2025-03-01", "confirmed"),
];

test("one stop per book and date, lowest trust, Other book and replaced notes left off", () => {
  const m = buildMapModel({ logbooks, entries, today: "2026-11-18" });
  assert.deepEqual(m.lines.map((l) => l.logbook), ["airframe", "engine"]);
  assert.deepEqual(m.stops.map((s) => [s.logbook, s.date, s.trust, s.major]), [
    ["airframe", "2020-05-01", "confirmed", true],
    ["airframe", "2024-12-03", "ai_read", false],
    ["engine", "2024-12-03", "confirmed", true],
  ]);
  const visit = m.stops[1];
  assert.equal(visit.id, stopId("lb-air", "2024-12-03"));
  assert.match(visit.id, /^[0-9a-f]{16}$/);
  assert.deepEqual(visit.entryIds, ["1", "2"]);
  assert.deepEqual(visit.pageIds, ["p-1"]);
  assert.equal(m.undatedEntries, 1);
  assert.deepEqual(m.range, { from: "2020-05-01", to: "2027-11-18", scaleBreak: "2025-11-18" });
});

test("range and book filters", () => {
  const m = buildMapModel({ logbooks, entries, today: "2026-11-18", from: "2021-01-01", to: "2026-01-01", only: ["engine"] });
  assert.deepEqual(m.stops.map((s) => s.logbook), ["engine"]);
  // major is a property of the book, not of the window.
  assert.equal(buildMapModel({ logbooks, entries, today: "2026-11-18", from: "2021-01-01" }).stops[0].major, false);
});

test("dates: month arithmetic clamps, today follows the owner's zone", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-18", -12), "2025-11-18");
  const lateUtc = new Date("2026-11-19T03:00:00Z");
  assert.equal(todayIn("America/New_York", lateUtc), "2026-11-18");
  assert.equal(todayIn(null, lateUtc), "2026-11-19");
  assert.equal(todayIn("Not/AZone", lateUtc), "2026-11-19");
});

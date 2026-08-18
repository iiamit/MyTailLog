import { test } from "node:test";
import assert from "node:assert/strict";
import { titleCase, firstSentence, categorize, buildHistory, byMonth } from "../../mobile/src/history";

// Pure presentation logic from the iOS redesign's Maintenance-history screen,
// tested here because apps/mobile has no runner of its own. It's worth covering:
// a mangled title or a wrongly-merged entry would both be silent.

const E = (o: Partial<Parameters<typeof buildHistory>[0][number]>) =>
  ({ id: "e", entry_date: "2026-07-05", hobbs: null, tach: 4141.6, description: "", work_performed: "", signature_name: null, page_id: null, ...o }) as never;

test("titleCase: a shouted source becomes readable", () => {
  assert.equal(titleCase("CHANGE OIL AND FILTER"), "Change oil and filter");
});

test("titleCase: abbreviations survive", () => {
  // Title-casing must not turn AD into "Ad" or a part number into prose.
  assert.equal(titleCase("COMPLY WITH AD 2021-05-12"), "Comply with AD 2021-05-12");
  assert.match(titleCase("REPLACE CHT PROBE"), /CHT/);
  assert.match(titleCase("INSPECT PER FAA GUIDANCE"), /FAA/);
});

test("firstSentence: one line, and it doesn't cut mid-word", () => {
  const long = "Filter cut, no metal found. Serviced with 7 qt Phillips 66 20W-50 and returned to service.";
  assert.equal(firstSentence(long), "Filter cut, no metal found.");
  const nostop = "a".repeat(200);
  assert.ok(firstSentence(nostop).length <= 96);
});

test("categorize: routes by what the work actually was", () => {
  assert.equal(categorize("CHANGE OIL AND FILTER"), "oil");
  assert.equal(categorize("Transponder & pitot-static test"), "avionics");
  assert.equal(categorize("Annual inspection of airframe"), "inspection");
  assert.equal(categorize("Replaced nav light bulb"), "other");
});

test("buildHistory: the same oil change from two sources collapses to one", () => {
  // Real N9363V data: the same 5 Jul oil change was recorded twice, once in
  // caps by an import and once in sentence case, and both showed in the list.
  const out = buildHistory([
    E({ id: "a", description: "CHANGE OIL AND FILTER. CHECK FILTER FOR METAL AND DEBRIS. NONE FOUND." }),
    E({ id: "b", description: "Change oil and filter. Check filter for metal and debris, none found. Service with 7 qt of Phillips 66 20W-50." }),
  ]);
  assert.equal(out.length, 1, "duplicate entries must collapse");
  assert.equal(out[0].merged, 2, "and say that they did");
  assert.ok(!/[A-Z]{4,}/.test(out[0].title), `title still shouting: ${out[0].title}`);
});

test("buildHistory: two DIFFERENT jobs on the same day are NOT merged", () => {
  // Conservative on purpose — hiding a second job is worse than a duplicate.
  const out = buildHistory([
    E({ id: "a", description: "Change oil and filter" }),
    E({ id: "b", description: "Transponder and pitot-static test" }),
  ]);
  assert.equal(out.length, 2);
});

test("buildHistory: a different tach on the same day is a different job", () => {
  const out = buildHistory([
    E({ id: "a", tach: 4141.6, description: "Change oil and filter" }),
    E({ id: "b", tach: 4160.2, description: "Change oil and filter" }),
  ]);
  assert.equal(out.length, 2);
});

test("byMonth: groups newest-first under month labels", () => {
  const out = byMonth(buildHistory([
    E({ id: "a", entry_date: "2026-08-02", description: "Oil change" }),
    E({ id: "b", entry_date: "2026-07-05", description: "Annual inspection" }),
  ]));
  assert.deepEqual(out.map((g) => g.label), ["AUGUST 2026", "JULY 2026"]);
});

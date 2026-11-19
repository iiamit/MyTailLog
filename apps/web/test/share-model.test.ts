import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDossier, buildSummary, pageCode, roomMap, summaryText, type ShareExtras, type ShareInput } from "../src/lib/share/model";
import type { MapInput } from "../src/lib/mapModel";

// W-SHARE-03/04 view models and the 13 §7.2 rule: unconfirmed entries change no record room content, dossier,
// summary or due-list export. Built on the N734DM map fixture (four books, gaps, an unconfirmed 2026 annual).
const fx = JSON.parse(readFileSync(new URL("../../../packages/shared/fixtures/map-model.json", import.meta.url), "utf8"));
const base = fx.cases.find((c: { name: string }) => c.name === "N734DM");
const withAi = fx.cases.find((c: { name: string }) => c.name.startsWith("unconfirmed:"));
const extras: ShareExtras = {
  aircraft: { tail_number: "N734DM", make: "Cessna", model: "172N", year: 1978, serial_number: "17269841", engine_serials: ["L-1"], prop_serials: ["P-1"] },
  ownerName: "D. Owner",
  ads: [
    { id: "ad1", kind: "ad", reference: "76-07-12", title: "Fuel caps", status: "complied", recurring: false, complied_date: "1998-04-18", complied_hours: 2101.5, reference_entry_id: null },
  ],
  squawks: [{ description: "Left brake soft", severity: "medium", reported_at: "2026-11-01T10:00:00Z", reporter_name: "R. Pilot", status: "open" }],
  components: [{ name: "GTN 650", make: "Garmin", part_number: "011-01057-00", serial_number: null, install_date: "2019-03-12", is_installed: true }],
  wb: { revision_date: "2019-01-01", empty_weight: 1447.8, empty_weight_arm: 39.61, max_gross_weight: 2300 },
};
const share = (c: { input: MapInput; today: string }): ShareInput => ({ input: c.input, today: c.today, extras });
const { _options: _ignored, ...inputBase } = base.input;
void _ignored;

test("rule 7.2: AI-read entries change neither the summary (due list) nor the dossier", () => {
  assert.ok(withAi.input.log_entry.length > base.input.log_entry.length, "the fixture adds unconfirmed entries");
  assert.deepEqual(buildSummary(share(withAi)), buildSummary(share(base)));
  const a = buildDossier(share(withAi)), b = buildDossier(share({ ...base, input: inputBase }));
  // Unconfirmed pages are counted apart ("not included"); everything else is identical.
  assert.deepEqual({ ...a, unconfirmedPages: 0, notCovered: [] }, { ...b, unconfirmedPages: 0, notCovered: [] });
});

test("rule 7.2: an AI-read entry adds no stop to the dossier or room map", () => {
  const ai = { ...base.input, log_entry: [...base.input.log_entry, { ...base.input.log_entry[0], id: "e-ai-new", entry_date: "2026-10-01", trust: "ai_read", description: "Engine overhaul" }] };
  const d = buildDossier(share({ ...base, input: ai }));
  assert.ok(d.map.stops.every((s) => !s.entryIds.includes("e-ai-new")));
  const room = { logbook_ids: base.input.logbook.map((l: { id: string }) => l.id), map_window: "whole_life" as const };
  assert.ok(roomMap(share({ ...base, input: ai }), room).stops.every((s) => !s.entryIds.includes("e-ai-new")));
});

test("room map: only the room's logbooks", () => {
  const engine = base.input.logbook.find((l: { type: string }) => l.type === "engine");
  const m = roomMap(share(base), { logbook_ids: [engine.id], map_window: "whole_life" });
  assert.deepEqual(m.lines.map((l) => l.logbook), ["engine"]);
  assert.ok(m.stops.every((s) => s.logbook === "engine"));
});

test("dossier: every gap and major stop on the map has a footnote, numbered in date order", () => {
  const d = buildDossier(share(base), { preparedFor: "J. Okafor" });
  assert.ok(d.map.gaps.length > 0);
  for (const g of d.map.gaps) assert.ok(d.marks[`gap:${g.id}`], `gap ${g.id} has a number`);
  for (const s of d.map.stops.filter((x) => x.major)) assert.ok(d.marks[`stop:${s.id}`], `major stop ${s.date} has a number`);
  assert.deepEqual(d.footnotes.map((f) => f.n), d.footnotes.map((_, i) => i + 1));
  assert.match(d.prepared, /by D\. Owner for J\. Okafor/);
  assert.equal(d.empty, false);
});

test("summary: page codes, reporters only when asked, squawks hidden when not included", () => {
  assert.equal(pageCode("Airframe p. 61"), "AF 61");
  assert.equal(pageCode("Engine p. 38"), "EN 38");
  assert.equal(pageCode(null), null);
  assert.equal(buildSummary(share(base)).squawks[0].reporter, null);
  assert.equal(buildSummary(share(base), { includeReporters: true }).squawks[0].reporter, "R. Pilot");
  const hidden = buildSummary(share(base), { includeSquawks: false });
  assert.equal(hidden.squawksShown, false);
  assert.deepEqual(hidden.squawks, []);
  assert.equal(buildSummary(share(base)).wb?.mayBeStale, true);
});

test("PDF: the summary and dossier render in-process", async () => {
  const { summaryPdf, dossierPdf } = await import("../src/lib/pdf/render");
  const s = await summaryPdf(buildSummary(share(base)));
  const d = await dossierPdf(buildDossier(share(base)));
  assert.equal(s.subarray(0, 5).toString(), "%PDF-");
  assert.equal(d.subarray(0, 5).toString(), "%PDF-");
  assert.ok(d.length > s.length);
});

test("dossier: nothing confirmed → the empty state", () => {
  const none = { ...base.input, log_entry: base.input.log_entry.map((e: object) => ({ ...e, trust: "ai_read" })) };
  assert.equal(buildDossier(share({ ...base, input: none })).empty, true);
});

test("summary as text (W-SHARE-04 Copy as text): every row with its page, squawks only when shown", () => {
  const m = buildSummary(share(base));
  const text = summaryText(m);
  assert.ok(text.startsWith("N734DM maintenance summary\n"));
  for (const i of m.items) assert.ok(text.includes(`- ${i.label}: ${i.status}.`), i.label);
  for (const i of m.items.filter((x) => x.page)) assert.ok(text.includes(`[${i.page}]`));
  assert.match(text, /Left brake soft/);
  assert.doesNotMatch(summaryText(buildSummary(share(base), { includeSquawks: false })), /Left brake soft|Open squawks/);
  assert.ok(text.endsWith(m.footer));
});

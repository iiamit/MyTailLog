import { test } from "node:test";
import assert from "node:assert/strict";
import { build, stale } from "../../../packages/shared/scripts/build-map-fixtures";
import { layoutMap, type Layout } from "../src/ui/map/map-layout";
import type { MapModel } from "../src/lib/mapModel";

const files = Object.fromEntries(Object.entries(build()).map(([f, t]) => [f, JSON.parse(t)]));

test("map fixtures: committed files are current", () => {
  assert.deepEqual(stale(), [], "fixtures are stale: cd apps/web && node --import tsx ../../packages/shared/scripts/build-map-fixtures.ts");
  for (const f of Object.values(files)) {
    assert.ok(f.rule && Number.isInteger(f.algoVersion));
    for (const c of f.cases) assert.deepEqual(Object.keys(c), ["name", "today", "input", "expected"]);
  }
  const names = Object.values(files).flatMap((f) => f.cases.map((c: { name: string }) => c.name)).join("\n");
  for (const a of [/^N734DM/m, /^hangar/m, /^nothing scanned/m, /^twin/m, /^5,000 entries/m]) assert.match(names, a);
});

type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** 10 §14: no label overlaps another label, a stop, a ring or a capsule; text never below 12 px rendered. */
function checkLabels(l: Layout, renderedWidth: number, name: string) {
  const k = renderedWidth / l.width;
  assert.ok(l.fontSize * k >= 12.9, `${name}: labels render at ${l.fontSize * k}px`);
  const boxes = l.labels.map((t) => {
    const w = t.text.length * l.fontSize * 0.56;
    const x = t.anchor === "start" ? t.x : t.anchor === "end" ? t.x - w : t.x - w / 2;
    return { x: x + 0.2, y: t.y - 0.8 * l.fontSize + 0.2, w: w - 0.4, h: l.fontSize - 0.4, text: t.text };
  });
  const marks: Box[] = [
    ...l.stops.map((s) => ({ x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r })),
    ...l.rings.map((r) => ({ x: r.x - r.r, y: r.y - r.r, w: 2 * r.r, h: 2 * r.r })),
    ...l.interchanges, ...l.visits,
  ];
  boxes.forEach((b, i) => {
    assert.ok(b.text.length <= 33, `${name}: "${b.text}" too long`);
    for (const o of boxes.slice(i + 1)) assert.ok(!overlap(b, o), `${name}: "${b.text}" overlaps "${o.text}"`);
    for (const m of marks) assert.ok(!overlap(b, m), `${name}: "${b.text}" overlaps a mark`);
  });
}

test("map layout: no label overlaps in any fixture size", () => {
  for (const f of [files["map-layout.json"], files["map-layout-stress.json"]])
    for (const c of f.cases) {
      const opts = Array.isArray(c.input.options) ? c.input.options : [c.input.options];
      const outs = Array.isArray(c.expected) ? c.expected : [c.expected];
      opts.forEach((o: { renderedWidth?: number }, i: number) => checkLabels(outs[i], o.renderedWidth ?? outs[i].width, c.name));
    }
});

test("map layout: N734DM at every acceptance width keeps labels apart (10 §14)", () => {
  const m: MapModel = files["map-model.json"].cases.find((c: { name: string }) => c.name === "N734DM").expected;
  for (const w of [1024, 1280, 1440, 1920].map((px) => px - 380)) checkLabels(layoutMap(m, { size: "routemap", renderedWidth: w }), w, `routemap ${w}`);
  for (const w of [375, 430]) checkLabels(layoutMap(m, { size: "phone", renderedWidth: w }), w, `phone ${w}`);
});

test("map layout: unconfirmed stops are dotted, interchange stops sit under their capsule", () => {
  const l: Layout = files["map-layout.json"].cases.find((c: { name: string }) => c.name === "N734DM: routemap").expected;
  const m: MapModel = files["map-model.json"].cases.find((c: { name: string }) => c.name === "N734DM").expected;
  const dotted = l.stops.filter((s) => s.dotted).flatMap((s) => s.ids);
  assert.ok(dotted.length > 0);
  for (const id of dotted) assert.ok(m.stops.some((s) => s.id === id && s.trust === "ai_read") || l.stops.some((s) => s.ids.includes(id) && s.count > 1));
  const under = new Set(m.interchanges.flatMap((x) => x.stopIds));
  assert.ok(l.stops.every((s) => s.ids.every((id) => !under.has(id))));
  assert.ok(l.interchanges.find((x) => x.id === m.interchanges.find((i) => i.trust === "ai_read")!.id)!.dotted);
});

test("map layout: 1,000 stops lay out quickly (10 §12)", () => {
  const big: MapModel = files["map-layout-stress.json"].cases[0].input.model;
  const m = { ...big, stops: big.stops.slice(0, 1000) };
  const t0 = performance.now();
  layoutMap(m, { size: "phone" });
  assert.ok(performance.now() - t0 < 200, "layout took too long");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import {
  buildAnnualPacket,
  selectPacketEvidence,
  annualPacketText,
  type PacketEvidence,
} from "../src/lib/annualPacket";
import { annualArchive } from "../src/lib/annualArchive";
import type { ShareInput } from "../src/lib/share/model";

const fx = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/shared/fixtures/map-model.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const base = fx.cases.find((c: { name: string }) => c.name === "N734DM");
const source: PacketEvidence = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "page",
  label: "Engine p. 1",
  available: true,
  href: "/api/page/11111111-1111-4111-8111-111111111111/image",
  fileName: "scans/11111111-1111-4111-8111-111111111111.jpg",
};
const share = (): ShareInput => ({
  input: structuredClone(base.input),
  today: base.today,
  extras: {
    aircraft: {
      tail_number: "N734DM",
      make: "Cessna",
      model: "172N",
      year: 1978,
      serial_number: "172-1",
      engine_serials: ["ENGINE-1"],
      prop_serials: ["PROP-1"],
    },
    ownerName: "Example owner",
    ads: [],
    squawks: [],
    components: [],
    wb: null,
  },
});

test("annual packet preserves unknowns, meter provenance and explicit source availability", () => {
  const packet = buildAnnualPacket(
    share(),
    [
      source,
      {
        ...source,
        id: "22222222-2222-4222-8222-222222222222",
        label: "Missing page",
        available: false,
      },
    ],
    [
      {
        kind: "ad",
        reference: "2026-01-01",
        status: "not_applicable",
        method: null,
        reason: "Different installed component",
        applicability: "Check part number",
        reference_entry_id: null,
      },
    ],
    "2026-11-25T12:00:00Z",
  );
  assert.equal(packet.generatedAt, "2026-11-25T12:00:00Z");
  assert.equal(packet.cutoff, base.today);
  assert.match(packet.summary.title, /annual preparation packet/);
  assert.equal(packet.serials.engines[0], "ENGINE-1");
  assert.ok(packet.warnings.some((w) => /Verify applicability/.test(w)));
  assert.ok(
    packet.warnings.some((w) => /Source unavailable: Missing page/.test(w)),
  );
  assert.equal(packet.directives[0].rationale, "Different installed component");
  assert.match(annualPacketText(packet), /Meter provenance/);
  assert.match(annualPacketText(packet), /Different installed component/);
});

test("unreviewed extraction cannot improve the annual packet's completion claims", () => {
  const current = share();
  const baseline = buildAnnualPacket(current, [], []);
  current.input.log_entry!.push({
    ...current.input.log_entry![0],
    id: "unreviewed",
    entry_date: current.today,
    trust: "ai_read",
    description: "Annual inspection completed",
  });
  const draft = buildAnnualPacket(current, [], []);
  assert.deepEqual(draft.summary.items, baseline.summary.items);
  assert.ok(draft.warnings.some((w) => /unconfirmed.*excluded/.test(w)));
});

test("packet evidence is opt-in, deduplicated and restricted to the authorized manifest", () => {
  const packet = buildAnnualPacket(share(), [source], []);
  assert.deepEqual(selectPacketEvidence(packet, {}), []);
  assert.deepEqual(
    selectPacketEvidence(packet, { pageIds: [source.id, source.id] }),
    [source],
  );
  assert.throws(
    () => selectPacketEvidence(packet, { documentIds: [source.id] }),
    /not in this aircraft/,
  );
  assert.throws(
    () =>
      selectPacketEvidence(packet, {
        pageIds: ["22222222-2222-4222-8222-222222222222"],
      }),
    /not in this aircraft/,
  );
  assert.throws(
    () => selectPacketEvidence(packet, { pageIds: ["../foreign/file"] }),
    /valid UUID/,
  );
  assert.throws(
    () =>
      selectPacketEvidence(
        { ...packet, evidence: [{ ...source, available: false }] },
        { pageIds: [source.id] },
      ),
    /unavailable/,
  );
});

test("annual evidence ZIP retains selected bytes and a readable standalone index", async () => {
  const packet = buildAnnualPacket(share(), [source], []);
  const data = new Uint8Array([255, 216, 255, 217]);
  const buffer = await new Response(
    annualArchive(packet, Buffer.from("%PDF-test"), [source], async () => data),
  ).arrayBuffer();
  const files = unzipSync(new Uint8Array(buffer));
  assert.deepEqual(files[source.fileName], data);
  assert.equal(
    Buffer.from(files["annual-summary.pdf"]).toString(),
    "%PDF-test",
  );
  assert.match(Buffer.from(files["README.txt"]).toString(), /Included files/);
  assert.equal(
    JSON.parse(Buffer.from(files["manifest.json"]).toString()).selectedEvidence
      .length,
    1,
  );
  const empty = unzipSync(
    new Uint8Array(
      await new Response(
        annualArchive(packet, Buffer.from("%PDF-test"), [], async () =>
          assert.fail("unselected evidence must not be read"),
        ),
      ).arrayBuffer(),
    ),
  );
  assert.ok(!empty[source.fileName]);
});

test("a selected source disappearing fails the download rather than silently omitting evidence", async () => {
  const packet = buildAnnualPacket(share(), [source], []);
  await assert.rejects(
    new Response(
      annualArchive(
        packet,
        Buffer.from("%PDF-test"),
        [source],
        async () => null,
      ),
    ).arrayBuffer(),
    /could not be read/,
  );
});

test("annual PDF renders warning and provenance sections without a browser", async () => {
  const { annualPacketPdf } = await import("../src/lib/pdf/render");
  const pdf = await annualPacketPdf(buildAnnualPacket(share(), [source], []));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

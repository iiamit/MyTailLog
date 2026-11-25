import {
  buildSummary,
  summaryText,
  type ShareInput,
  type SummaryModel,
} from "./share/model";
import { computeStatus } from "./due/engine";
import { counts } from "./mapModel";

import { PACKET_MAX_FILES } from "./annualPacketLimits";
export { PACKET_MAX_FILES, PACKET_MAX_BYTES } from "./annualPacketLimits";
export type PacketEvidence = {
  id: string;
  kind: "page" | "document";
  label: string;
  available: boolean;
  href: string;
  fileName: string;
};
export type AnnualPacket = {
  tail: string;
  generatedAt: string;
  cutoff: string;
  summary: SummaryModel;
  warnings: string[];
  evidence: PacketEvidence[];
  meters: {
    meter: string;
    reading: number | null;
    asOf: string | null;
    source: string | null;
    estimated: boolean;
  }[];
  serials: { airframe: string | null; engines: string[]; propellers: string[] };
  directives: {
    reference: string;
    status: string;
    method: string | null;
    rationale: string | null;
    applicability: string | null;
    entryId: string | null;
  }[];
};
export type PacketDirective = {
  kind: string;
  reference: string;
  status: string;
  method: string | null;
  reason: string | null;
  applicability: string | null;
  reference_entry_id: string | null;
};

/** A current record snapshot, not a reconstruction of what the database held on a past date. */
export function buildAnnualPacket(
  share: ShareInput,
  evidence: PacketEvidence[],
  directives: PacketDirective[],
  generatedAt = new Date().toISOString(),
): AnnualPacket {
  const summary = buildSummary(share);
  summary.title = `${summary.tail} annual preparation packet`;
  const status = computeStatus(share.input, share.today);
  const warnings: string[] = [
    "Verify applicability with your IA. Candidate matches and missing records do not establish compliance.",
  ];
  for (const item of summary.items) {
    if (item.statusKey !== "current")
      warnings.push(
        `${item.label}: ${item.status}. ${item.nextDue !== "—" ? `Next due ${item.nextDue}.` : "Confirm its schedule and evidence."}`,
      );
    if (item.lastDone !== "No record" && !item.page)
      warnings.push(
        `${item.label}: no scanned page cited. Confirm the owner-entered completion against the original records.`,
      );
  }
  for (const ad of summary.ads) {
    if (ad.status === "Proof not yet confirmed" || ad.status === "Open")
      warnings.push(`${ad.reference}: ${ad.status}.`);
    if (
      (ad.status === "Complied" || ad.status === "Previously complied") &&
      !ad.page
    )
      warnings.push(
        `${ad.reference}: compliance has no confirmed scanned-page citation; check the original or owner-entered record.`,
      );
  }
  const awaiting = (share.input.log_entry ?? []).filter(
    (e) => !counts(e) && !e.replaced_by_entry_id,
  ).length;
  if (awaiting)
    warnings.push(
      `${awaiting} unconfirmed ${awaiting === 1 ? "entry is" : "entries are"} excluded from completed maintenance evidence.`,
    );
  for (const gap of share.input.logbook_gap ?? []) {
    if (["open", "asked_previous_owner", "no_pages_exist"].includes(gap.status))
      warnings.push(
        `Record gap ${gap.from_date} to ${gap.to_date}: ${gap.status.replaceAll("_", " ")}.`,
      );
  }
  if (summary.wb?.mayBeStale)
    warnings.push("Weight and balance may be stale after equipment changes.");
  if (!summary.wb) warnings.push("No weight and balance revision is recorded.");
  for (const e of evidence)
    if (!e.available) warnings.push(`Source unavailable: ${e.label}.`);
  return {
    tail: summary.tail,
    generatedAt,
    cutoff: share.today,
    summary,
    warnings: [...new Set(warnings)],
    evidence,
    meters: Object.entries(status.meters).map(([meter, m]) => ({
      meter,
      reading: m.face,
      asOf: m.asOf,
      source: m.source,
      estimated: m.source === "adsb_estimate",
    })),
    serials: {
      airframe: share.extras.aircraft.serial_number,
      engines: share.extras.aircraft.engine_serials,
      propellers: share.extras.aircraft.prop_serials,
    },
    directives: directives.map((a) => ({
      reference: `${a.kind.toUpperCase()} ${a.reference}`,
      status: a.status,
      method: a.method,
      rationale: a.reason,
      applicability: a.applicability,
      entryId: a.reference_entry_id,
    })),
  };
}

/** Explicit selection is also checked against the caller's aircraft-scoped manifest. */
export function selectPacketEvidence(
  packet: AnnualPacket,
  selection: unknown,
): PacketEvidence[] {
  if (!selection || typeof selection !== "object" || Array.isArray(selection))
    throw new Error("Choose the evidence to include.");
  const value = selection as Record<string, unknown>;
  const selected: PacketEvidence[] = [];
  for (const [key, kind] of [
    ["pageIds", "page"],
    ["documentIds", "document"],
  ] as const) {
    const ids = value[key] ?? [];
    if (
      !Array.isArray(ids) ||
      ids.some(
        (id) =>
          typeof id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          ),
      )
    )
      throw new Error("Evidence IDs must be valid UUIDs.");
    for (const id of new Set(ids)) {
      const e = packet.evidence.find(
        (item) => item.kind === kind && item.id === id,
      );
      if (!e || !e.available)
        throw new Error(
          "Selected evidence is unavailable or is not in this aircraft.",
        );
      selected.push(e);
    }
  }
  if (selected.length > PACKET_MAX_FILES)
    throw new Error(
      `Choose at most ${PACKET_MAX_FILES} evidence files per packet.`,
    );
  return selected;
}

export function annualPacketText(packet: AnnualPacket): string {
  return [
    summaryText(packet.summary),
    "",
    `Generated: ${packet.generatedAt}`,
    `Records evaluated on: ${packet.cutoff}`,
    "",
    "Unresolved before the annual",
    ...packet.warnings.map((w) => `- ${w}`),
    "",
    "Meter provenance",
    ...packet.meters.map(
      (m) =>
        `- ${m.meter}: ${m.reading ?? "missing"}; ${m.estimated ? "estimated" : "recorded"}; ${m.source ?? "no source"}; ${m.asOf ?? "no date"}`,
    ),
    "",
    "AD review details",
    ...packet.directives.map(
      (a) =>
        `- ${a.reference}: ${a.status}; method: ${a.method ?? "not recorded"}; rationale: ${a.rationale ?? "not recorded"}; applicability: ${a.applicability ?? "verify with IA"}`,
    ),
    "",
    "Evidence index (only selected files are included in a ZIP)",
    ...packet.evidence.map(
      (e) => `- ${e.label}: ${e.available ? e.href : "unavailable"}`,
    ),
  ].join("\n");
}

import type {
  Component,
  OilAddition,
  OilAnalysisSample,
} from "@/lib/database.types";
import { engineTrends, type TrendEntry } from "@/lib/engineTrends";
import type { EngineEvent, EngineGroup, EngineHistory } from "./contracts";
export function buildEngineHistory(
  components: Component[],
  events: EngineEvent[],
  entries: TrendEntry[],
  samples: OilAnalysisSample[],
  additions: OilAddition[],
  resets: { meter: string; reset_date: string }[],
  canEdit = false,
): EngineHistory {
  const explicitSources = new Set(
    events
      .filter((e) => e.kind === "compression" && e.source_entry_id)
      .map((e) => e.source_entry_id),
  );
  const trends = engineTrends(entries, resets),
    groups: EngineGroup[] = [];
  const engines = components.filter((c) => c.category === "engine");
  for (const c of engines) {
    const boundaries = [
      ...new Set(
        [
          ...events
            .filter(
              (e) =>
                e.component_id === c.id &&
                (e.kind === "overhaul" || e.kind === "cylinder_replacement"),
            )
            .map((e) => e.event_date),
          ...resets.map((r) => r.reset_date),
        ].filter(
          (d) =>
            (!c.install_date || d >= c.install_date) &&
            (!c.removal_date || d < c.removal_date),
        ),
      ),
    ].sort();
    const starts: [string | null, ...string[]] = [
      c.install_date,
      ...boundaries.filter((d) => d !== c.install_date),
    ];
    starts.forEach((start, i) =>
      groups.push({
        componentId: c.id,
        name: c.name,
        position: c.position ?? null,
        start,
        end: starts[i + 1] ?? c.removal_date,
        segmentId: `${c.id}:${start ?? "unknown"}`,
        compression: [],
        oilChanges: [],
        oilIntervals: [],
        samples: [],
        additions: [],
      }),
    );
  }
  const unassigned: EngineHistory["unassigned"] = {
    compression: [],
    oilChanges: [],
    samples: [],
    additions: [],
  };
  const groupFor = (componentId: string | null, date: string | null) =>
    date
      ? groups.find(
          (g) =>
            g.componentId === componentId &&
            (!g.start || date >= g.start) &&
            (!g.end || date < g.end),
        )
      : undefined;
  // A dated entry without an explicit engine is attributed only to a single documented installation interval.
  const componentForDate = (date: string | null) => {
    const candidates = engines.filter(
      (c) =>
        date &&
        c.install_date &&
        date >= c.install_date &&
        (!c.removal_date || date < c.removal_date),
    );
    return candidates.length === 1 ? candidates[0].id : null;
  };
  const entryComponent = (entryId: string, date: string | null) => {
    const ids = new Set(
      events
        .filter((e) => e.source_entry_id === entryId)
        .map((e) => e.component_id),
    );
    return ids.size === 1
      ? [...ids][0]
      : ids.size > 1
        ? null
        : componentForDate(date);
  };
  for (const test of trends.compression) {
    if (explicitSources.has(test.entryId)) continue;
    const g = groupFor(entryComponent(test.entryId, test.date), test.date);
    (g?.compression ?? unassigned.compression).push(test);
  }
  for (const change of trends.oilChanges) {
    const g = groupFor(
      entryComponent(change.entryId, change.date),
      change.date,
    );
    (g?.oilChanges ?? unassigned.oilChanges).push(change);
  }
  for (const event of events.filter((e) => e.kind === "compression")) {
    const g = groupFor(event.component_id, event.event_date);
    (g?.compression ?? unassigned.compression).push({
      entryId: event.source_entry_id ?? event.id,
      observationId: event.id,
      sourceEntryId: event.source_entry_id,
      pageId: event.source_page_id,
      date: event.event_date,
      confirmed: true,
      readings: event.readings,
      source: event.notes ?? "Reviewed compression observation",
      meterBasis: event.meter_basis,
      meterReading: event.meter_reading,
    });
  }
  for (const sample of samples) {
    const g = groupFor(
      sample.component_id ?? componentForDate(sample.sample_date),
      sample.sample_date,
    );
    (g?.samples ?? unassigned.samples).push(sample);
  }
  for (const addition of additions) {
    const g = groupFor(
      addition.component_id ?? componentForDate(addition.added_date),
      addition.added_date,
    );
    (g?.additions ?? unassigned.additions).push(addition);
  }
  for (const g of groups) {
    g.compression.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    g.oilChanges.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const ids = new Set(g.oilChanges.map((c) => c.entryId));
    g.oilIntervals = engineTrends(
      entries.filter((e) => ids.has(e.id)),
      resets,
    ).oilIntervals;
  }
  return {
    components: engines,
    events,
    groups,
    unassigned,
    needsReview: trends.needsReview,
    canEdit,
  };
}

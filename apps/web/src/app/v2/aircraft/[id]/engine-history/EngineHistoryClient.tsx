"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CompressionTest } from "@/lib/engineTrends";
import type {
  EngineEvent,
  EngineHistory,
  EngineGroup,
} from "@/lib/owner/contracts";
import { fmtDate as formatDate } from "@/lib/due/engine";
import { Button, buttonClass } from "@/ui/Button";
import { Field, Notice, fieldClass } from "@/ui/Form";
import { Leaves, Leaf } from "@/ui/Board";
import { WearChart } from "../oil/WearChart";
import { engineConsumption } from "@/lib/owner/consumption";

const fmtDate = (date: string | null) =>
  date ? formatDate(date) : "Date not recorded";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? "Could not load engine history. Try again.");
  return body;
}

export function EngineHistoryClient({ aircraftId }: { aircraftId: string }) {
  const endpoint = `/api/aircraft/${aircraftId}/engine-history`;
  const [history, setHistory] = useState<EngineHistory | null>(null);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<EngineEvent["kind"]>("compression");
  const [editing, setEditing] = useState<EngineEvent | null>(null);
  const [draftId, setDraftId] = useState("");
  const load = useCallback(
    async () => setHistory(await request<EngineHistory>(endpoint)),
    [endpoint],
  );
  useEffect(() => {
    const controller = new AbortController();
    request<EngineHistory>(endpoint, { signal: controller.signal })
      .then((data) => {
        setHistory(data);
        setDraftId(crypto.randomUUID());
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setMessage(e.message);
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [endpoint]);
  const group =
    history?.groups.find((g) => g.segmentId === selected) ??
    history?.groups[history.groups.length - 1];
  const component = history?.components.find(
    (c) => c.id === group?.componentId,
  );
  const a = `/aircraft/${aircraftId}`;
  function result(text: string, error = false) {
    setMessage(text);
    setFailed(error);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    result("");
    try {
      const written = Array.from({ length: 12 }, (_, i) => ({
        cylinder: i + 1,
        psi: String(values.get(`psi-${i + 1}`) ?? ""),
        reference: String(values.get(`reference-${i + 1}`) ?? ""),
      }));
      if (
        kind === "compression" &&
        written.some((r) => (r.psi === "") !== (r.reference === ""))
      )
        throw new Error(
          "Enter both measured and reference pressure for each recorded cylinder.",
        );
      const readings = written
        .filter((r) => r.psi !== "" && r.reference !== "")
        .map((r) => ({
          cylinder: r.cylinder,
          psi: Number(r.psi),
          reference: Number(r.reference),
        }));
      const payload = {
        id: editing?.id ?? draftId,
        component_id: values.get("component_id"),
        event_date: values.get("event_date"),
        kind,
        readings: kind === "compression" ? readings : [],
        cylinders:
          kind === "cylinder_replacement"
            ? values.getAll("cylinder").map(Number)
            : [],
        notes: values.get("notes") || null,
        meter_basis: values.get("meter_basis") || null,
        meter_reading:
          values.get("meter_reading") === ""
            ? null
            : Number(values.get("meter_reading")),
        source_entry_id: values.get("source_entry_id") || null,
        source_page_id: values.get("source_page_id") || null,
        ...(editing ? { base: editing.updated_at } : {}),
      };
      await request(editing ? `${endpoint}/${editing.id}` : endpoint, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      setEditing(null);
      setDraftId(crypto.randomUUID());
      form.reset();
      await load();
      result("Engine observation saved.");
    } catch (e) {
      result((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(event: EngineEvent) {
    if (
      !window.confirm(
        `Delete this ${event.kind.replaceAll("_", " ")} observation from ${fmtDate(event.event_date)}? Its source record will stay intact.`,
      )
    )
      return;
    setBusy(true);
    try {
      await request(
        `${endpoint}/${event.id}?base=${encodeURIComponent(event.updated_at)}`,
        { method: "DELETE" },
      );
      await load();
      result("Observation deleted; the original log entry is unchanged.");
    } catch (e) {
      result((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function savePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!component) return;
    setBusy(true);
    try {
      await request(`${endpoint}/components/${component.id}/position`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          position: new FormData(event.currentTarget).get("position"),
          base: component.updated_at,
        }),
      });
      await load();
      result("Engine position saved.");
    } catch (e) {
      result((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Leaves>
      <Leaf label="Engine history">
        <div className="space-y-7">
          <header className="max-w-prose space-y-2">
            <h2 className="text-heading">Engine history</h2>
            <p>
              Follow each engine through installations and overhauls.
              Compression values retain the pressure used in the original test;
              they are observations, not a diagnosis.
            </p>
          </header>
          {message && (
            <Notice tone={failed ? "alarm" : "info"}>{message}</Notice>
          )}
          {!history ? (
            <div>
              <p role="status">
                {failed
                  ? "Engine history is unavailable."
                  : "Loading engine history…"}
              </p>
              {failed && (
                <Button
                  variant="quiet"
                  onClick={() =>
                    void load().catch((e) => result(e.message, true))
                  }
                >
                  Try again
                </Button>
              )}
            </div>
          ) : (
            <>
              {history.groups.length > 0 ? (
                <>
                  <Field label="Engine and service period">
                    <select
                      className={fieldClass}
                      value={group?.segmentId ?? ""}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      {history.groups.map((g) => (
                        <option key={g.segmentId} value={g.segmentId}>
                          {g.name}
                          {g.position ? ` · ${g.position}` : ""} ·{" "}
                          {g.start
                            ? fmtDate(g.start)
                            : "Installation date unknown"}{" "}
                          – {g.end ? fmtDate(g.end) : "present"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {component && (
                    <p className="text-small text-ink-2">
                      {component.make} {component.part_number} · Serial{" "}
                      {component.serial_number ?? "not recorded"}
                    </p>
                  )}
                  {component && history.canEdit && (
                    <form
                      key={component.id + component.updated_at}
                      onSubmit={savePosition}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <Field label="Engine position">
                        <input
                          name="position"
                          maxLength={80}
                          defaultValue={component.position ?? ""}
                          placeholder="For example, left or right"
                          className={fieldClass}
                        />
                      </Field>
                      <Button variant="quiet" type="submit" disabled={busy}>
                        Save position
                      </Button>
                    </form>
                  )}
                  <CompressionRecords
                    rows={group?.compression ?? []}
                    aircraftId={aircraftId}
                  />
                  <section className="space-y-3">
                    <h3 className="text-subheading">
                      Oil service and analysis
                    </h3>
                    <p>
                      {group?.oilChanges.length ?? 0} oil services ·{" "}
                      {group?.samples.length ?? 0} lab samples ·{" "}
                      {group?.additions.length ?? 0} oil additions in this
                      service period.
                    </p>
                    <ul className="space-y-2">
                      {group?.oilIntervals.map((interval) => (
                        <li key={interval.to.entryId}>
                          <Link
                            className="underline"
                            href={`${a}/logbooks/entries/${interval.to.entryId}`}
                          >
                            {fmtDate(interval.from.date)} to{" "}
                            {fmtDate(interval.to.date)}
                          </Link>
                          : {interval.hours} {interval.meter} hours between
                          confirmed oil services
                        </li>
                      ))}
                    </ul>
                    <Link className={buttonClass("quiet")} href={`${a}/oil`}>
                      Open oil analysis and reports
                    </Link>
                  </section>
                  {group && (
                    <EngineOilRecords key={group.segmentId} group={group} />
                  )}
                  <section className="space-y-3">
                    <h3 className="text-subheading">Lifecycle observations</h3>
                    <p className="text-small text-ink-2">
                      Overhaul and meter-reset boundaries separate service
                      periods. Compression points are not joined across cylinder
                      replacements.
                    </p>
                    <ul className="divide-y divide-line">
                      {history.events
                        .filter((e) => e.component_id === group?.componentId)
                        .map((event) => (
                          <li key={event.id} className="space-y-2 py-3">
                            <strong>
                              {fmtDate(event.event_date)} ·{" "}
                              {event.kind.replaceAll("_", " ")}
                            </strong>
                            {event.cylinders.length > 0 && (
                              <p>Cylinders {event.cylinders.join(", ")}</p>
                            )}
                            {event.notes && (
                              <p className="max-w-prose whitespace-pre-wrap break-words">
                                {event.notes}
                              </p>
                            )}
                            {event.source_entry_id && (
                              <Link
                                className="mr-4 underline"
                                href={`${a}/logbooks/entries/${event.source_entry_id}`}
                              >
                                Source entry
                              </Link>
                            )}
                            {event.source_page_id && (
                              <a
                                className="underline"
                                href={`/api/page/${event.source_page_id}/image`}
                              >
                                Original page
                              </a>
                            )}
                            {history.canEdit && (
                              <div className="flex gap-2">
                                <Button
                                  variant="quiet"
                                  disabled={busy}
                                  onClick={() => {
                                    setEditing(event);
                                    setKind(event.kind);
                                  }}
                                >
                                  Edit observation
                                </Button>
                                <Button
                                  variant="quiet"
                                  disabled={busy}
                                  onClick={() => void remove(event)}
                                >
                                  Delete observation
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                    </ul>
                  </section>
                </>
              ) : (
                <section className="space-y-3">
                  <h3 className="text-subheading">Start with an engine</h3>
                  <p>
                    Add its serial number and installation date so historical
                    readings can be assigned accurately.
                  </p>
                  {history.canEdit && (
                    <Link
                      className={buttonClass("quiet")}
                      href={`${a}/equipment?panel=new`}
                    >
                      Add engine equipment
                    </Link>
                  )}
                </section>
              )}
              <details>
                <summary className="cursor-pointer py-3 text-subheading">
                  Unassigned records (
                  {history.unassigned.compression.length +
                    history.unassigned.oilChanges.length +
                    history.unassigned.samples.length +
                    history.unassigned.additions.length}
                  )
                </summary>
                <p className="mb-4 max-w-prose">
                  Records without a unique engine installation stay here.
                  Twin-engine and replaced-engine histories are never combined
                  by guesswork. Add a source-linked observation to identify the
                  correct engine.
                </p>
                <CompressionRecords
                  rows={history.unassigned.compression}
                  aircraftId={aircraftId}
                />
                <p className="mt-4">
                  {history.unassigned.oilChanges.length} oil services ·{" "}
                  {history.unassigned.samples.length} lab samples ·{" "}
                  {history.unassigned.additions.length} oil additions need an
                  engine installation before they can contribute to a trend.
                </p>
                <Link className="inline-block py-3 underline" href={`${a}/oil`}>
                  Review original oil reports and additions
                </Link>
                {history.needsReview.map((row) => (
                  <p key={row.entryId} className="py-2">
                    <Link
                      className="underline"
                      href={`${a}/logbooks/entries/${row.entryId}`}
                    >
                      {fmtDate(row.date)} · {row.reason}
                    </Link>
                  </p>
                ))}
              </details>
            </>
          )}
        </div>
      </Leaf>
      <Leaf label="Record engine observation">
        {history?.canEdit && history.components.length > 0 ? (
          <section className="border-t border-line pt-5">
            <h3 id="observation-heading" className="mb-4 text-subheading">
              {editing ? "Correct observation" : "Record an observation"}
            </h3>
            <form
              key={editing?.id ?? draftId}
              onSubmit={save}
              aria-labelledby="observation-heading"
              className="max-w-2xl space-y-4"
            >
              <fieldset disabled={busy} className="space-y-4">
                <legend className="sr-only">Engine observation details</legend>
                <Field label="Engine">
                  <select
                    name="component_id"
                    defaultValue={editing?.component_id ?? component?.id}
                    className={fieldClass}
                  >
                    {history.components.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ·{" "}
                        {c.position ?? c.serial_number ?? "position not set"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Observation">
                  <select
                    value={kind}
                    onChange={(e) =>
                      setKind(e.target.value as EngineEvent["kind"])
                    }
                    className={fieldClass}
                  >
                    <option value="compression">Compression test</option>
                    <option value="overhaul">Overhaul</option>
                    <option value="cylinder_replacement">
                      Cylinder replacement
                    </option>
                  </select>
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    name="event_date"
                    required
                    defaultValue={
                      editing?.event_date ??
                      new Date().toISOString().slice(0, 10)
                    }
                    className={fieldClass}
                  />
                </Field>
                {kind === "compression" && (
                  <fieldset>
                    <legend className="mb-2 text-label">
                      Written compression readings (leave unused cylinders
                      blank)
                    </legend>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {Array.from({ length: 12 }, (_, i) => {
                        const r = editing?.readings.find(
                          (r) => r.cylinder === i + 1,
                        );
                        return (
                          <fieldset key={i} className="min-w-0">
                            <legend>Cylinder {i + 1}</legend>
                            <label className="block text-small">
                              Measured psi
                              <input
                                name={`psi-${i + 1}`}
                                type="number"
                                min="0"
                                max="120"
                                step="any"
                                defaultValue={r?.psi}
                                className={fieldClass}
                              />
                            </label>
                            <label className="block text-small">
                              Reference psi
                              <input
                                name={`reference-${i + 1}`}
                                type="number"
                                min="1"
                                max="120"
                                step="any"
                                defaultValue={r?.reference}
                                className={fieldClass}
                              />
                            </label>
                          </fieldset>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                {kind === "cylinder_replacement" && (
                  <fieldset>
                    <legend>Replaced cylinders</legend>
                    <div className="flex flex-wrap gap-3">
                      {Array.from({ length: 12 }, (_, i) => (
                        <label
                          key={i}
                          className="inline-flex min-h-11 items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            name="cylinder"
                            value={i + 1}
                            defaultChecked={editing?.cylinders.includes(i + 1)}
                          />{" "}
                          {i + 1}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Meter">
                    <select
                      name="meter_basis"
                      defaultValue={editing?.meter_basis ?? ""}
                      className={fieldClass}
                    >
                      <option value="">Not recorded</option>
                      <option value="tach">Tach</option>
                      <option value="hobbs">Hobbs</option>
                    </select>
                  </Field>
                  <Field label="Meter reading">
                    <input
                      name="meter_reading"
                      type="number"
                      min="0"
                      step="0.1"
                      defaultValue={editing?.meter_reading ?? ""}
                      className={fieldClass}
                    />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea
                    name="notes"
                    maxLength={4000}
                    defaultValue={editing?.notes ?? ""}
                    className={`${fieldClass} h-auto py-2`}
                    rows={3}
                  />
                </Field>
                <details>
                  <summary className="cursor-pointer py-3">
                    Link to an existing source
                  </summary>
                  <p className="mb-2 text-small text-ink-2">
                    Choose the entry or original page that supports this
                    observation.
                  </p>
                  <Field label="Source entry (optional)">
                    <select
                      name="source_entry_id"
                      defaultValue={editing?.source_entry_id ?? ""}
                      className={fieldClass}
                    >
                      <option value="">No linked entry</option>
                      {editing?.source_entry_id &&
                        !history.sources?.entries.some(
                          (e) => e.id === editing.source_entry_id,
                        ) && (
                          <option value={editing.source_entry_id}>
                            Previously linked entry
                          </option>
                        )}
                      {history.sources?.entries.map((e) => (
                        <option key={e.id} value={e.id}>
                          {fmtDate(e.date)} · {e.description || "Logbook entry"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Original page (optional)">
                    <select
                      name="source_page_id"
                      defaultValue={editing?.source_page_id ?? ""}
                      className={fieldClass}
                    >
                      <option value="">No linked page</option>
                      {history.sources?.pages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </details>
                <div className="flex gap-3">
                  <Button type="submit" disabled={!draftId}>
                    Save observation
                  </Button>
                  {editing && (
                    <Button
                      variant="quiet"
                      type="button"
                      onClick={() => setEditing(null)}
                    >
                      Cancel correction
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
          </section>
        ) : (
          <div className="space-y-3">
            <h3 className="text-subheading">Source-linked observations</h3>
            <p>
              {history?.canEdit
                ? "Add an engine in Equipment before recording a compression test, overhaul or cylinder replacement."
                : "People with edit access can record and correct observations here. Original records remain available from the history."}
            </p>
          </div>
        )}
      </Leaf>
    </Leaves>
  );
}

function CompressionRecords({
  rows,
  aircraftId,
}: {
  rows: CompressionTest[];
  aircraftId: string;
}) {
  const [cylinder, setCylinder] = useState(1);
  const confirmed = rows.filter(
    (r) =>
      r.confirmed &&
      r.date &&
      Number.isFinite(Date.parse(`${r.date}T00:00:00Z`)),
  );
  const cylinders = [
    ...new Set(confirmed.flatMap((r) => r.readings.map((x) => x.cylinder))),
  ].sort((a, b) => a - b);
  const selectedCylinder = cylinders.includes(cylinder)
    ? cylinder
    : cylinders[0];
  const dates = confirmed
    .map((r) => Date.parse(`${r.date}T00:00:00Z`))
    .filter(Number.isFinite);
  const min = Math.min(...dates),
    max = Math.max(...dates);
  const references = [
    ...new Set(confirmed.flatMap((r) => r.readings.map((x) => x.reference))),
  ].sort((a, b) => a - b);
  return (
    <section className="space-y-3">
      <h3 className="text-subheading">Compression observations</h3>
      {rows.length === 0 ? (
        <p>No compression observations in this period.</p>
      ) : (
        <>
          {cylinders.length > 0 && (
            <Field label="Chart cylinder">
              <select
                value={selectedCylinder}
                onChange={(e) => setCylinder(Number(e.target.value))}
                className={fieldClass}
              >
                {cylinders.map((c) => (
                  <option key={c} value={c}>
                    Cylinder {c}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className="text-small text-ink-2">
            Points show the written test results. No line connects observations
            across cylinder changes; the exact values and sources are below.
          </p>
          {references
            .filter((reference) =>
              confirmed.some((t) =>
                t.readings.some(
                  (r) =>
                    r.reference === reference &&
                    r.cylinder === selectedCylinder,
                ),
              ),
            )
            .map((reference) => (
              <figure key={reference} className="max-w-3xl">
                <figcaption className="mb-2 text-label">
                  Tests at {reference} psi reference pressure
                </figcaption>
                <svg
                  viewBox="0 0 600 150"
                  role="img"
                  aria-label={`Compression measurements at ${reference} psi reference pressure, by test date. Exact values and sources follow in the table.`}
                  className="w-full"
                >
                  <text
                    x="25"
                    y="29"
                    textAnchor="end"
                    fontSize="11"
                    fill="currentColor"
                  >
                    {reference}
                  </text>
                  <text
                    x="25"
                    y="123"
                    textAnchor="end"
                    fontSize="11"
                    fill="currentColor"
                  >
                    0
                  </text>
                  <line
                    x1="35"
                    y1="125"
                    x2="565"
                    y2="125"
                    stroke="currentColor"
                    opacity="0.3"
                  />
                  <text x="35" y="145" fontSize="12" fill="currentColor">
                    {fmtDate(new Date(min).toISOString().slice(0, 10))}
                  </text>
                  <text
                    x="565"
                    y="145"
                    textAnchor="end"
                    fontSize="12"
                    fill="currentColor"
                  >
                    {fmtDate(new Date(max).toISOString().slice(0, 10))}
                  </text>
                  {confirmed.flatMap((test, index) =>
                    test.readings
                      .filter(
                        (r) =>
                          r.reference === reference &&
                          r.cylinder === selectedCylinder,
                      )
                      .map((r) => {
                        const x =
                          max === min
                            ? 300
                            : 35 +
                              ((Date.parse(`${test.date}T00:00:00Z`) - min) /
                                (max - min)) *
                                530;
                        const y = 120 - (r.psi / reference) * 95;
                        return (
                          <g
                            key={`${test.observationId ?? test.entryId}:${r.cylinder}:${index}`}
                          >
                            <circle cx={x} cy={y} r="5" fill="currentColor" />
                            <text
                              x={x > 530 ? x - 8 : x + 8}
                              y={y - 8}
                              textAnchor={x > 530 ? "end" : "start"}
                              fontSize="11"
                              fill="currentColor"
                            >
                              {r.psi}/{r.reference}
                            </text>
                            <title>
                              {fmtDate(test.date)} · cylinder {r.cylinder}:{" "}
                              {r.psi}/{r.reference}
                            </title>
                          </g>
                        );
                      }),
                  )}
                </svg>
              </figure>
            ))}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-small">
              <caption className="mb-2 text-left text-ink-2">
                Original values, test dates, meter readings and provenance.
                Unconfirmed extractions do not appear in the plot.
              </caption>
              <thead>
                <tr className="border-b border-line">
                  <th className="p-2">Date</th>
                  <th className="p-2">Cylinder / reading</th>
                  <th className="p-2">Meter</th>
                  <th className="p-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={`${row.observationId ?? row.entryId}:${index}`}
                    className="border-b border-line align-top"
                  >
                    <td className="p-2 whitespace-nowrap">
                      {fmtDate(row.date)}
                      {!row.confirmed && (
                        <span className="block">Needs verification</span>
                      )}
                    </td>
                    <td className="p-2 tabular-nums">
                      {row.readings
                        .map((r) => `C${r.cylinder}: ${r.psi}/${r.reference}`)
                        .join(" · ")}
                    </td>
                    <td className="p-2">
                      {row.meterReading == null
                        ? "Not recorded"
                        : `${row.meterReading} ${row.meterBasis ?? ""}`}
                    </td>
                    <td className="p-2">
                      {(row.sourceEntryId ??
                      (!row.observationId ? row.entryId : null)) ? (
                        <Link
                          className="underline"
                          href={`/aircraft/${aircraftId}/logbooks/entries/${row.sourceEntryId ?? row.entryId}`}
                        >
                          Source entry
                        </Link>
                      ) : (
                        "Owner observation"
                      )}
                      {row.pageId && (
                        <a
                          className="mt-2 block underline"
                          href={`/api/page/${row.pageId}/image`}
                        >
                          Original page
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function EngineOilRecords({ group }: { group: EngineGroup }) {
  const consumption = engineConsumption(group.additions);
  return (
    <section className="space-y-4">
      <h3 className="text-subheading">Oil use in this engine period</h3>
      <p>
        {consumption
          ? `${consumption.hoursPerQuart.toFixed(1)} ${consumption.meter} hours per quart · ${consumption.hours.toFixed(1)} hours / ${consumption.quarts.toFixed(2)} quarts added after the first reading.`
          : "A rate needs dated top-offs with complete, increasing readings on one meter. Missing or ambiguous readings are not estimated."}
      </p>
      <p className="text-small text-ink-2">
        Historical records without an engine ID are included only when one
        documented engine installation covers their date.
      </p>
      {group.samples.length > 0 && (
        <>
          <h3 className="text-subheading">Wear metals in this engine period</h3>
          <WearChart
            samples={[...group.samples]
              .sort((a, b) => a.sample_date.localeCompare(b.sample_date))
              .map((s) => ({
                id: s.id,
                date: s.sample_date,
                label: formatDate(s.sample_date),
                oilHours: s.oil_hours,
                ppm: s.elements_ppm ?? {},
                avg: s.universal_averages ?? {},
              }))}
          />
          <ul className="divide-y divide-line">
            {group.samples.map((sample) => (
              <li key={sample.id} className="space-y-2 py-3">
                <strong>
                  {formatDate(sample.sample_date)} ·{" "}
                  {sample.lab ?? "Oil analysis"}
                </strong>
                <p className="max-w-prose whitespace-pre-wrap">
                  {sample.lab_comments}
                </p>
                {sample.source_inbox_id ? (
                  <a
                    className="inline-block py-2 underline"
                    href={`/api/aircraft/${sample.aircraft_id}/inbox/${sample.source_inbox_id}/file`}
                  >
                    Original report
                  </a>
                ) : sample.source_page_id ? (
                  <a
                    className="inline-block py-2 underline"
                    href={`/api/page/${sample.source_page_id}/image`}
                  >
                    Source page
                  </a>
                ) : (
                  <span className="text-small text-ink-2">
                    No original linked
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {group.additions.length > 0 && (
        <details>
          <summary className="cursor-pointer py-3 text-label">
            Top-off readings ({group.additions.length})
          </summary>
          <ul className="divide-y divide-line">
            {group.additions.map((row) => (
              <li key={row.id} className="py-3 tabular-nums">
                {formatDate(row.added_date)} · {row.quarts} qt · Tach{" "}
                {row.tach ?? "not recorded"} · Hobbs{" "}
                {row.hobbs ?? "not recorded"}
                {row.notes && <p>{row.notes}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

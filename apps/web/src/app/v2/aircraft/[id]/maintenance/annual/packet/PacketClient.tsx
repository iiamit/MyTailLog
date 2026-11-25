"use client";

import { useState } from "react";
import type { AnnualPacket } from "@/lib/annualPacket";
import { PACKET_MAX_FILES } from "@/lib/annualPacketLimits";
import { Leaf, Leaves, HungSection } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { Notice, fieldClass } from "@/ui/Form";

export function PacketClient({
  aircraftId,
  packet,
}: {
  aircraftId: string;
  packet: AnnualPacket;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const endpoint = `/api/aircraft/${aircraftId}/annual-packet`;
  async function download(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const files = packet.evidence.filter((e) =>
        selected.has(`${e.kind}:${e.id}`),
      );
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "zip",
          cutoff: packet.cutoff,
          pageIds: files.filter((e) => e.kind === "page").map((e) => e.id),
          documentIds: files
            .filter((e) => e.kind === "document")
            .map((e) => e.id),
        }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error || "The packet could not be prepared.",
        );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${packet.tail}-annual-packet.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(
        `Packet downloaded with ${files.length} selected evidence ${files.length === 1 ? "file" : "files"}.`,
      );
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "The download failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Leaves split="1fr 1fr">
      <Leaf label="Annual preparation packet">
        <p className="mb-3 text-body text-ink-2">
          A dated handoff for your IA, with the records behind it. This is a
          preparation checklist, not an inspection sign-off.
        </p>
        <p className="mb-4 text-small text-ink-3">
          Records evaluated on {packet.cutoff}. Generated{" "}
          {packet.generatedAt.slice(0, 16).replace("T", " ") + " UTC"}.
        </p>
        <a
          href={`${endpoint}?format=pdf&cutoff=${packet.cutoff}`}
          className={buttonClass("primary", "m")}
        >
          Open printable PDF
        </a>
        <HungSection title="Resolve before the annual">
          <ul className="list-disc space-y-2 pl-5 text-body">
            {packet.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </HungSection>
        <HungSection title="Meter readings">
          <dl className="space-y-3 text-body">
            {packet.meters.map((meter) => (
              <div key={meter.meter}>
                <dt className="font-semibold">{meter.meter}</dt>
                <dd>
                  {meter.reading?.toFixed(1) ?? "Not recorded"} ·{" "}
                  {meter.estimated
                    ? "estimated"
                    : (meter.source ?? "no source")}{" "}
                  · {meter.asOf ?? "no date"}
                </dd>
              </div>
            ))}
          </dl>
        </HungSection>
        <HungSection title="Inspections and recurring work">
          <ul className="space-y-3 text-body">
            {packet.summary.items.map((item) => (
              <li key={item.key}>
                <b>{item.label}</b>: {item.status}. Next due {item.nextDue}.{" "}
                {item.page ? `Source ${item.page}.` : "No page cited."}
              </li>
            ))}
          </ul>
        </HungSection>
      </Leaf>
      <Leaf label="Choose supporting evidence">
        <p id="packet-evidence-help" className="mb-3 text-body text-ink-2">
          Nothing is included automatically. Choose up to {PACKET_MAX_FILES}{" "}
          files, within 100 MB. The ZIP includes the summary, an evidence index,
          and your selected files for offline reading.
        </p>
        <label htmlFor="packet-filter" className="text-label">
          Find a page or document
        </label>
        <input
          id="packet-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={fieldClass}
        />
        <form
          onSubmit={download}
          aria-label="Download annual evidence"
          className="mt-4"
        >
          <fieldset aria-describedby="packet-evidence-help" disabled={busy}>
            <legend className="mb-2 text-label">
              Evidence · {selected.size} selected
            </legend>
            {packet.evidence
              .filter((e) =>
                e.label.toLowerCase().includes(filter.toLowerCase()),
              )
              .map((e) => {
                const key = `${e.kind}:${e.id}`;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 border-b border-rule py-1"
                  >
                    <input
                      id={`evidence-${key}`}
                      name="evidence"
                      type="checkbox"
                      checked={selected.has(key)}
                      disabled={
                        !e.available ||
                        (!selected.has(key) &&
                          selected.size >= PACKET_MAX_FILES)
                      }
                      onChange={(event) => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(key);
                        else next.delete(key);
                        setSelected(next);
                      }}
                      className="size-5 shrink-0 accent-[var(--color-ink)]"
                    />
                    <label
                      htmlFor={`evidence-${key}`}
                      className="flex min-h-12 min-w-0 flex-1 items-center break-words text-body"
                    >
                      {e.label}
                      {!e.available && " · source unavailable"}
                    </label>
                    {e.available && (
                      <a
                        href={e.href}
                        className={buttonClass("quiet", "s")}
                        aria-label={`Open ${e.label}`}
                      >
                        Open
                      </a>
                    )}
                  </div>
                );
              })}
            {packet.evidence.length > 0 &&
              !packet.evidence.some((e) =>
                e.label.toLowerCase().includes(filter.toLowerCase()),
              ) && (
                <p className="text-body text-ink-2">
                  No matching evidence. Try a different page or document name.
                </p>
              )}
            {packet.evidence.length === 0 && (
              <p className="text-body text-ink-2">
                No pages or documents recorded yet.
              </p>
            )}
          </fieldset>
          <button
            type="submit"
            disabled={busy}
            className={`mt-4 ${buttonClass("primary", "m")}`}
          >
            {busy ? "Preparing packet…" : "Download evidence ZIP"}
          </button>
          {message && (
            <div className="mt-3">
              <Notice tone={failed ? "alarm" : "info"}>{message}</Notice>
            </div>
          )}
        </form>
      </Leaf>
    </Leaves>
  );
}

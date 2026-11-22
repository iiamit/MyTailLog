"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { MeterName } from "@/lib/due/engine";
import { fmtDate } from "@/lib/due/engine";
import { fmtMeter, markDonePreview } from "@/lib/v2/status";
import { buttonClass } from "@/ui/Button";
import { markItemDone, type MarkDoneState } from "../../actions";

const field = "mt-1 block h-[42px] w-full rounded-control border border-control-border bg-leaf px-3 text-body text-ink";

/** W-STATUS-04 mark-done drawer for a calendar or hours item (02 §3.15 over the right leaf). */
export function MarkDoneDrawer({
  aircraftId,
  itemId,
  base: initialBase,
  label,
  kind,
  meter,
  intervalMonths,
  intervalHours,
  today,
  latest,
  closeHref,
}: {
  aircraftId: string;
  itemId: string;
  base: string;
  label: string;
  kind: string;
  meter: MeterName;
  intervalMonths: number | null;
  intervalHours: number | null;
  today: string;
  latest: { value: number; date: string | null } | null;
  closeHref: string;
}) {
  const [state, action, pending] = useActionState<MarkDoneState, FormData>(markItemDone.bind(null, aircraftId, itemId), null);
  const [base] = useState(initialBase);
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState(latest ? latest.value.toFixed(1) : "");
  const h = hours.trim() === "" ? null : Number(hours);
  const preview = markDonePreview(kind, date || null, h != null && Number.isFinite(h) ? h : null, meter, intervalMonths, intervalHours);
  const meterName = meter[0].toUpperCase() + meter.slice(1);

  return (
    <section aria-labelledby="done-title" className="flex min-w-0 flex-col overflow-auto rounded-leaf bg-leaf px-7 pt-[22px] pb-5 text-ink shadow-leaf">
      <h2 id="done-title" className="text-heading">
        Mark {label} done
      </h2>
      <form action={action} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="base" value={base} />
        <label className="text-label">
          Date done
          <input name="date" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className="text-label">
          {meterName}
          <input
            name="hours"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-describedby="meter-help"
            className={field}
          />
          {latest && (
            <span id="meter-help" className="mt-1 block text-small font-normal text-ink-3">
              Last reading {fmtMeter(latest.value)}
              {latest.date ? ` on ${fmtDate(latest.date)}` : ""}
            </span>
          )}
        </label>
        <input type="hidden" name="meter" value={meter} />
        {latest && <input type="hidden" name="latest" value={latest.value} />}
        {state?.warning && <input type="hidden" name="confirmLower" value="1" />}
        <p className="text-small text-ink-2">
          The page: add it later. Your note is replaced by the page when it is scanned and confirmed.
        </p>
        {preview && (
          <p className="rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3.5 text-body" aria-live="polite">
            {preview}
          </p>
        )}
        {state?.error && (
          <p role="alert" className="text-small font-semibold text-alarm-text">
            {state.error}
          </p>
        )}
        {state?.warning && (
          <p role="alert" className="text-small font-semibold text-alarm-text">
            {state.warning}
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>
            {state?.warning ? "Save anyway" : "Mark done"}
          </button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}

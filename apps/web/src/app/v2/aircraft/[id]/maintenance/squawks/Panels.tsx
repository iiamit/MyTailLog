"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/ui/Button";
import { Field, FormLeaf, Notice, fieldClass } from "@/ui/Form";
import { SEVERITY_HELP, SEVERITY_WORD } from "@/lib/v2/squawks";
import type { SquawkSeverity } from "@/lib/database.types";
import { addSquawkPhoto, makeMechanicLink, reportSquawk, resolveSquawk } from "./actions";

const SEVERITIES: SquawkSeverity[] = ["low", "medium", "high"];

/** Upload one photo through POST …/blob (kind squawk_photo), then write its row. Returns an error or null. */
export async function uploadPhoto(aircraftId: string, squawkId: string, file: File): Promise<string | null> {
  const blobId = crypto.randomUUID();
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", "squawk_photo");
  fd.set("squawkId", squawkId);
  fd.set("id", blobId);
  const res = await fetch(`/api/aircraft/${aircraftId}/blob`, { method: "POST", body: fd }).catch(() => null);
  if (!res?.ok) return ((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Upload failed. Try again.";
  const r = await addSquawkPhoto(aircraftId, squawkId, blobId);
  return "error" in r ? r.error : null;
}

/** Severity as a Segmented control (02 §7.6): words carry the meaning, the Ground slip is the alarm colour. */
export function SeverityPicker({
  value,
  onChange,
  disabled,
  name = "severity",
}: {
  value: SquawkSeverity | null;
  onChange: (v: SquawkSeverity) => void;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Severity" className="mt-1 inline-flex rounded-control border border-control-border p-0.5">
      {SEVERITIES.map((s) => (
        <label
          key={s}
          title={SEVERITY_HELP[s]}
          className={`state-layer cursor-pointer rounded-[calc(var(--radius-control)-2px)] px-3.5 py-2 text-button-s has-[:focus-visible]:outline-2 ${
            value === s ? (s === "high" ? "bg-alarm text-on-alarm" : "bg-ink text-leaf") : "text-ink"
          } ${disabled ? "pointer-events-none opacity-40" : ""}`}
        >
          <input type="radio" name={name} value={s} checked={value === s} onChange={() => onChange(s)} disabled={disabled} className="sr-only" />
          {SEVERITY_WORD[s]}
        </label>
      ))}
    </div>
  );
}

/** Report a squawk (?panel=new): photos first, what's wrong, severity with no default. All roles. */
export function ReportPanel({ aircraftId, closeHref, selfHref }: { aircraftId: string; closeHref: string; selfHref: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<SquawkSeverity | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return setError("Describe what you noticed.");
    if (!severity) return setError("Pick how serious it is: Low, Watch or Ground.");
    start(async () => {
      const r = await reportSquawk(aircraftId, { description: text, severity });
      if ("error" in r) return setError(r.error);
      const failed = [];
      for (const f of files) if (await uploadPhoto(aircraftId, r.id!, f)) failed.push(f.name);
      router.replace(`${selfHref}?squawk=${r.id}&done=${failed.length ? "photos" : "reported"}`, { scroll: false });
      router.refresh();
    });
  }

  return (
    <FormLeaf title="Report a squawk" closeHref={closeHref}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Add photos" help="JPEG, PNG or HEIC, up to 6 MB each.">
          <input
            type="file"
            accept="image/jpeg,image/png,image/heic,image/webp"
            multiple
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
            className="mt-1 block min-h-[120px] w-full rounded-control border-2 border-dashed border-control-border bg-leaf-2 p-4 text-body text-ink-2"
          />
        </Field>
        <Field label="What's wrong?">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. Left brake feels soft on taxi"
            className={`${fieldClass} h-auto py-2`}
          />
        </Field>
        <div className="text-label">
          Severity
          <div>
            <SeverityPicker value={severity} onChange={setSeverity} />
          </div>
          {severity && <p className="mt-1 text-small font-normal text-ink-3">{SEVERITY_HELP[severity]}</p>}
        </div>
        {error && <Notice tone="alarm">{error}</Notice>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>
            {pending ? "Reporting…" : "Report squawk"}
          </button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>
            Cancel
          </Link>
        </div>
      </form>
    </FormLeaf>
  );
}

export type EntryOption = { id: string; label: string; date: string | null };

/** Resolve with an entry (?panel=resolve): the clearing entry, or "No entry, explain"; the date resolved. */
export function ResolvePanel({
  aircraftId,
  squawkId,
  base,
  description,
  entries,
  today,
  closeHref,
  writeHref,
}: {
  aircraftId: string;
  squawkId: string;
  base: string;
  description: string;
  entries: EntryOption[];
  today: string;
  closeHref: string;
  writeHref: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>(entries[0]?.id ?? "explain");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(entries[0]?.date ?? today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(v: string) {
    setChoice(v);
    const d = entries.find((e) => e.id === v)?.date;
    if (d) setDate(d);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await resolveSquawk(aircraftId, squawkId, { entryId: choice === "explain" ? null : choice, notes, date }, base);
      if ("error" in r) return setError(r.error);
      router.replace(`${closeHref}&done=resolved`, { scroll: false });
      router.refresh();
    });
  }

  return (
    <FormLeaf title="Resolve the squawk" closeHref={closeHref}>
      <p className="mb-4 text-body text-ink-2">{description}</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Which entry cleared it?" help={entries.length ? undefined : "No confirmed entries since it was reported."}>
          <select value={choice} onChange={(e) => pick(e.target.value)} className={fieldClass}>
            {entries.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            <option value="explain">No entry, explain</option>
          </select>
        </Field>
        <p className="-mt-2 text-small">
          <Link href={writeHref} className="font-semibold text-board-ink underline decoration-dotted">
            Write the entry now
          </Link>
        </p>
        <Field label={choice === "explain" ? "What was done" : "Notes (optional)"}>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} />
        </Field>
        <Field label="Date resolved">
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required className={fieldClass} />
        </Field>
        {error && <Notice tone="alarm">{error}</Notice>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>
            Resolve
          </button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>
            Cancel
          </Link>
        </div>
      </form>
    </FormLeaf>
  );
}

/** Send to mechanic (?panel=send): makes a squawk link; the owner sends it (09 §4.12). Online only. */
export function SendPanel({
  aircraftId,
  squawkId,
  open,
  providers,
  defaultFor,
  closeHref,
}: {
  aircraftId: string;
  squawkId: string;
  open: { id: string; description: string }[];
  providers: { id: string; name: string }[];
  defaultFor: string;
  closeHref: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(defaultFor);
  const [providerId, setProviderId] = useState("");
  const [ids, setIds] = useState<string[]>([squawkId]);
  const [days, setDays] = useState(30);
  const [photos, setPhotos] = useState(true);
  const [reporter, setReporter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; mailto: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!navigator.onLine) return setError("Making a link needs a connection.");
    start(async () => {
      const r = await makeMechanicLink(aircraftId, {
        squawkIds: ids, recipientLabel: label, providerId: providerId || null, expiresInDays: days, includePhotos: photos, includeReporter: reporter,
      });
      if ("error" in r) return setError(r.error);
      setError(null);
      setMade(r);
      router.refresh();
    });
  }

  if (made) {
    const ends = new Date(made.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return (
      <FormLeaf title="Send to mechanic" closeHref={closeHref}>
        <p className="text-body">The link is ready. MyTailLog doesn&apos;t send it; you do.</p>
        <input readOnly value={made.url} onFocus={(e) => e.target.select()} aria-label="Link" className={`${fieldClass} mt-3 font-mono text-small`} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass("primary", "m")}
            onClick={() => navigator.clipboard.writeText(made.url).then(() => setCopied(true))}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a href={made.mailto} className={buttonClass("secondary", "m")}>
            Open in your email
          </a>
        </div>
        <p className="mt-3 text-small text-ink-3" role="status">
          {copied ? "Link copied. " : ""}Ends {ends}. Revoke it any time from the squawk.
        </p>
      </FormLeaf>
    );
  }

  return (
    <FormLeaf title="Send to mechanic" closeHref={closeHref}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="For">
          <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} className={fieldClass} />
        </Field>
        {providers.length > 0 && (
          <Field label="Shop or mechanic (optional)">
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className={fieldClass}>
              <option value="">None</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <fieldset>
          <legend className="text-label">Squawks</legend>
          {open.map((s) => (
            <label key={s.id} className="mt-1.5 flex items-start gap-2 text-body">
              <input
                type="checkbox"
                checked={ids.includes(s.id)}
                onChange={(e) => setIds((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
                className="mt-1 size-4 accent-[var(--color-ink)]"
              />
              {s.description}
            </label>
          ))}
        </fieldset>
        <div className="text-label">
          Ends in
          <div role="radiogroup" aria-label="Ends in" className="mt-1 flex w-fit rounded-control border border-control-border p-0.5">
            {[7, 30, 90].map((d) => (
              <label
                key={d}
                className={`state-layer cursor-pointer rounded-[calc(var(--radius-control)-2px)] px-3.5 py-2 text-button-s has-[:focus-visible]:outline-2 ${days === d ? "bg-ink text-leaf" : "text-ink"}`}
              >
                <input type="radio" name="days" checked={days === d} onChange={() => setDays(d)} className="sr-only" />
                {d} days
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
          Include photos
        </label>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" checked={reporter} onChange={(e) => setReporter(e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
          Show who reported it
        </label>
        <p className="text-small text-ink-3">
          The link shows these squawks, their photos and related confirmed entries. No account needed. MyTailLog doesn&apos;t send it; you do.
        </p>
        {error && <Notice tone="alarm">{error}</Notice>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending || ids.length === 0} className={buttonClass("primary", "m")}>
            Make the link
          </button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>
            Cancel
          </Link>
        </div>
      </form>
    </FormLeaf>
  );
}

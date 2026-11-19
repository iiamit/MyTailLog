"use client";

import { useRef, useState } from "react";
import { HungSection } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { Field, fieldClass } from "@/ui/Form";
import { addAircraft } from "./actions";

type Registry = { make: string | null; model: string | null; serialNumber: string | null; year: number | null; engineMake: string | null; engineModel: string | null; registrantName: string | null };
const FROM_REGISTRY = ["make", "model", "year", "serial_number"] as const;

/** The add form (W-HANGAR-02): tail number, what the FAA registry knows (tagged until edited), then the owner's own details. */
export function AddAircraftForm() {
  const form = useRef<HTMLFormElement>(null);
  const [tail, setTail] = useState("");
  const [lookup, setLookup] = useState<{ busy: boolean; note: string | null; found: boolean }>({ busy: false, note: null, found: false });
  const [tagged, setTagged] = useState<Set<string>>(new Set());
  const [engine, setEngine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const looked = useRef("");

  async function lookUp() {
    const t = tail.trim().toUpperCase();
    if (!t) return setLookup({ busy: false, note: "Enter a tail number first.", found: false });
    looked.current = t;
    setLookup({ busy: true, note: "Looking up…", found: false });
    try {
      const res = await fetch(`/api/registry?tail=${encodeURIComponent(t)}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) return setLookup({ busy: false, note: `No FAA registration found for ${t}. Fill in what you know.`, found: false });
      if (!res.ok) return setLookup({ busy: false, note: "The registry lookup failed. Fill in what you know, or try again.", found: false });
      const r = data.record as Registry;
      const values: Record<(typeof FROM_REGISTRY)[number], string | number | null> = { make: r.make, model: r.model, year: r.year, serial_number: r.serialNumber };
      const next = new Set<string>();
      for (const name of FROM_REGISTRY) {
        const el = form.current?.elements.namedItem(name) as HTMLInputElement | null;
        if (el && values[name] != null && values[name] !== "") {
          el.value = String(values[name]);
          next.add(name);
        }
      }
      setTagged(next);
      setEngine([r.engineMake, r.engineModel].filter(Boolean).join(" ") || null);
      setLookup({
        busy: false,
        found: true,
        note: `Found in the FAA aircraft registry${r.registrantName ? `. Registered to ${r.registrantName}` : ""}. We filled in what the registry knows. Check it against the data plate.`,
      });
    } catch {
      setLookup({ busy: false, note: "The registry lookup failed. Fill in what you know, or try again.", found: false });
    }
  }

  const reg = (name: string, label: string, opts: { type?: string; placeholder?: string } = {}) => (
    <Field label={label} help={tagged.has(name) ? "FAA registry" : undefined}>
      <input
        name={name}
        type={opts.type ?? "text"}
        inputMode={opts.type === "number" ? "numeric" : undefined}
        placeholder={opts.placeholder}
        onChange={() => setTagged((s) => (s.has(name) ? new Set([...s].filter((x) => x !== name)) : s))}
        className={fieldClass}
      />
    </Field>
  );

  return (
    <form
      ref={form}
      action={async (fd) => {
        setPending(true);
        setError(null);
        // Redirects to setup on success; returns only with an error.
        const res = await addAircraft(fd);
        if (res?.error) {
          setError(res.error);
          setPending(false);
        }
      }}
    >
      <HungSection title="Tail number" first>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[220px]">
            <Field label="Tail number">
              <input
                name="tail_number"
                required
                value={tail}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="N12345"
                onChange={(e) => setTail(e.target.value.toUpperCase())}
                onBlur={() => tail.trim() && tail.trim().toUpperCase() !== looked.current && lookUp()}
                className={`${fieldClass} uppercase`}
              />
            </Field>
          </div>
          <button type="button" onClick={lookUp} disabled={lookup.busy} className={`${buttonClass("secondary", "s")} mb-1`}>
            {lookup.found ? "Look up again" : "Look up"}
          </button>
        </div>
        {lookup.note && <p role="status" className="mt-2 max-w-[60ch] text-small text-ink-2">{lookup.note}</p>}
      </HungSection>
      <HungSection title="From the registry">
        <div className="grid gap-4 sm:grid-cols-2">
          {reg("make", "Make")}
          {reg("model", "Model")}
          {reg("year", "Year", { type: "number" })}
          {reg("serial_number", "Airframe serial")}
        </div>
        {engine && <p className="mt-3 text-small text-ink-2">Engine on the registry: {engine}</p>}
      </HungSection>
      <HungSection title="From you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Engine serial" help="Comma-separated for more than one engine.">
            <input name="engine_serials" className={fieldClass} />
          </Field>
          <Field label="Propeller serial" help="Comma-separated for more than one.">
            <input name="prop_serials" className={fieldClass} />
          </Field>
          <Field label="Home airport" help="Private to you.">
            <input name="home_base" className={fieldClass} />
          </Field>
        </div>
      </HungSection>
      <div className="flex flex-wrap items-center gap-3 border-t-2 border-ink pt-4">
        <button type="submit" disabled={pending} className={buttonClass("primary", "l")}>
          {pending ? "Adding…" : tail.trim() ? `Add ${tail.trim()}` : "Add aircraft"}
        </button>
        <p className="text-small text-ink-3">Next: today&apos;s tach and your last annual, on one screen.</p>
      </div>
      {error && <p role="alert" className="mt-3 text-body font-semibold text-alarm-text">{error}</p>}
    </form>
  );
}

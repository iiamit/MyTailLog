"use client";

import { useRef, useState } from "react";
import { enrollAircraft } from "./actions";

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  hint,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-annun-red"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        placeholder={placeholder}
        className="rounded-md border border-line bg-panel2 px-3 py-2 text-ink outline-hidden focus:border-accent"
      />
      {hint && (
        <span className="text-xs text-faint">{hint}</span>
      )}
    </label>
  );
}

export function EnrollForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function action(formData: FormData) {
    setPending(true);
    setError(null);
    // enrollAircraft redirects on success; only returns on validation error.
    const result = await enrollAircraft(formData);
    if (result && "error" in result) {
      setError(result.error);
      setPending(false);
    }
  }

  // Prefill make/model/serial/year (and engine make/model as a note) from the
  // FAA registry, so the owner rarely types these by hand.
  async function lookupTail() {
    const form = formRef.current;
    if (!form) return;
    const tail = (form.elements.namedItem("tail_number") as HTMLInputElement)?.value?.trim();
    if (!tail) {
      setLookupNote("Enter a tail number first.");
      return;
    }
    setLookingUp(true);
    setLookupNote(null);
    try {
      const res = await fetch(`/api/registry?tail=${encodeURIComponent(tail)}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupNote(data.error ?? "Lookup failed.");
        return;
      }
      const r = data.record as {
        make: string | null; model: string | null; serialNumber: string | null;
        year: number | null; engineMake: string | null; engineModel: string | null;
        registrantName: string | null;
      };
      const setVal = (name: string, v: string | number | null) => {
        const el = form.elements.namedItem(name) as HTMLInputElement | null;
        if (el && v != null && v !== "") el.value = String(v);
      };
      setVal("make", r.make);
      setVal("model", r.model);
      setVal("serial_number", r.serialNumber);
      setVal("year", r.year);
      const engine = [r.engineMake, r.engineModel].filter(Boolean).join(" ");
      setLookupNote(
        `Filled from FAA registry${r.registrantName ? ` · ${r.registrantName}` : ""}${engine ? ` · engine: ${engine}` : ""}. Review and adjust as needed.`,
      );
    } catch {
      setLookupNote("Network error during lookup.");
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="Tail number" name="tail_number" required placeholder="N12345" />
        </div>
        <button
          type="button"
          onClick={lookupTail}
          disabled={lookingUp}
          className="mb-[2px] shrink-0 rounded-md border border-line px-3 py-2 text-sm font-medium text-dim hover:border-line2 hover:text-ink disabled:opacity-50"
        >
          {lookingUp ? "Looking up…" : "Look up FAA registry"}
        </button>
      </div>
      {lookupNote && (
        <p className="-mt-2 text-xs text-faint">{lookupNote}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Make" name="make" placeholder="Cessna" />
        <Field label="Model" name="model" placeholder="172N" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Year" name="year" type="number" placeholder="1978" />
        <Field label="Serial number" name="serial_number" placeholder="17271234" />
      </div>
      <Field
        label="Engine serial(s)"
        name="engine_serials"
        placeholder="L-12345-27A"
        hint="Comma-separated for multi-engine."
      />
      <Field
        label="Prop serial(s)"
        name="prop_serials"
        placeholder="EN-98765"
        hint="Comma-separated for multi-engine."
      />
      <Field
        label="Home base"
        name="home_base"
        placeholder="KXYZ"
        hint="Sensitive — stored private to your account."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Hobbs at enrollment"
          name="enrollment_hobbs"
          type="number"
          step="0.1"
          placeholder="2450.3"
        />
        <Field
          label="Tach at enrollment"
          name="enrollment_tach"
          type="number"
          step="0.1"
          placeholder="1890.5"
        />
      </div>

      {error && <p className="text-sm text-annun-red">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Enrolling…" : "Enroll aircraft"}
      </button>
    </form>
  );
}

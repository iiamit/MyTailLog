"use client";

import { useState } from "react";
import { enrollAircraft } from "./actions";

function Field({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      {hint && (
        <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      )}
    </label>
  );
}

export function EnrollForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Tail number" name="tail_number" required placeholder="N12345" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Make" name="make" placeholder="Cessna" />
        <Field label="Model" name="model" placeholder="172N" />
      </div>
      <div className="grid grid-cols-2 gap-4">
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
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Hobbs at enrollment"
          name="enrollment_hobbs"
          type="number"
          placeholder="2450.3"
        />
        <Field
          label="Tach at enrollment"
          name="enrollment_tach"
          type="number"
          placeholder="1890.5"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {pending ? "Enrolling…" : "Enroll aircraft"}
      </button>
    </form>
  );
}

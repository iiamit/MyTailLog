"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveAircraftDetails } from "./actions";

type Details = {
  id: string; make: string | null; model: string | null; year: number | null;
  serial_number: string | null; engine_serials: string[]; prop_serials: string[]; home_base: string | null;
};

function Field({ label, name, value, hint, type = "text" }: {
  label: string; name: string; value: string | number | null; hint?: string; type?: string;
}) {
  return <label className="flex flex-col gap-1 text-sm font-medium text-ink">
    {label}
    <input name={name} type={type} defaultValue={value ?? ""} className="rounded-md border border-line bg-panel2 px-3 py-2 text-ink outline-hidden focus:border-accent" />
    {hint && <span className="text-xs font-normal text-dim">{hint}</span>}
  </label>;
}

export function DetailsForm({ aircraft }: { aircraft: Details }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  async function save(formData: FormData) {
    setPending(true);
    setError("");
    setSaved(false);
    const result = await saveAircraftDetails(aircraft.id, formData);
    if ("error" in result) { setError(result.error); setPending(false); return; }
    setSaved(true);
    setPending(false);
    router.refresh();
  }
  return <form action={save} className="mt-6 flex flex-col gap-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Make" name="make" value={aircraft.make} />
      <Field label="Model" name="model" value={aircraft.model} />
      <Field label="Year" name="year" type="number" value={aircraft.year} />
      <Field label="Airframe serial number" name="serial_number" value={aircraft.serial_number} />
    </div>
    <Field label="Engine serial number(s)" name="engine_serials" value={aircraft.engine_serials.join(", ")} hint="Separate multiple engines with commas." />
    <Field label="Propeller serial number(s)" name="prop_serials" value={aircraft.prop_serials.join(", ")} hint="Separate multiple propellers with commas." />
    <Field label="Home base" name="home_base" value={aircraft.home_base} />
    {error && <p role="alert" className="text-sm text-annun-red">{error}</p>}
    {saved && <p role="status" className="text-sm text-annun-green">Aircraft details saved.</p>}
    <button type="submit" disabled={pending} className="self-start rounded-md bg-accent px-5 py-2.5 font-medium text-bg disabled:opacity-60">
      {pending ? "Saving…" : "Save aircraft details"}
    </button>
  </form>;
}

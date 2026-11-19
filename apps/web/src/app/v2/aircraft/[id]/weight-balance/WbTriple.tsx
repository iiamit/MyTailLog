"use client";

import { useState } from "react";
import { completeWB } from "@/lib/weightBalance";
import { Field, fieldClass } from "@/ui/Form";

const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

/** Empty weight, CG arm and moment: type any two and the third is shown as it will be saved (moment = weight × arm). */
export function WbTriple({ weight, arm, moment }: { weight: number | null; arm: number | null; moment: number | null }) {
  const [v, setV] = useState({ w: weight?.toString() ?? "", a: arm?.toString() ?? "", m: moment?.toString() ?? "" });
  const typed = { weight: num(v.w), arm: num(v.a), moment: num(v.m) };
  const out = completeWB(typed);
  const filled = (["weight", "arm", "moment"] as const).find((k) => typed[k] == null && out[k] != null);
  const box = (key: "w" | "a" | "m", name: string, label: string, unit: string, k: "weight" | "arm" | "moment") => (
    <Field label={`${label} (${unit})`}>
      <input
        name={name}
        type="number"
        step="any"
        inputMode="decimal"
        value={v[key]}
        placeholder={filled === k ? String(out[k]) : undefined}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
        className={`${fieldClass} tabular-nums`}
      />
    </Field>
  );
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {box("w", "empty_weight", "Empty weight", "lb", "weight")}
        {box("a", "empty_weight_arm", "CG arm", "in", "arm")}
        {box("m", "empty_weight_moment", "Moment", "lb-in", "moment")}
      </div>
      <p className="mt-1 text-small text-ink-3" aria-live="polite">
        {filled
          ? `${filled === "weight" ? "Empty weight" : filled === "arm" ? "CG arm" : "Moment"} works out to ${out[filled]}.`
          : "Enter any two of weight, arm and moment; the third is worked out (moment = weight × arm)."}
      </p>
    </div>
  );
}

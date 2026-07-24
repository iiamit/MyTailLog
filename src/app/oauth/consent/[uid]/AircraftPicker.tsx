"use client";

import { useState } from "react";

type Ac = { id: string; tail_number: string; make: string | null; model: string | null };

// The scope-of-sharing control on the consent screen. Defaults to an
// account-wide grant ("All my aircraft", incl. ones added later); switching to
// "Only the aircraft I choose" reveals the per-aircraft checkboxes. The radio
// submits `share_scope`; the checkboxes submit `aircraft` (only rendered — and
// therefore only posted — in the selected mode). Lives in the parent's native
// <form>, so submission is plain POST with no JS beyond the toggle.
export function AircraftPicker({ aircraft }: { aircraft: Ac[] }) {
  const [mode, setMode] = useState<"all" | "selected">("all");

  return (
    <section>
      <div className="text-xs font-medium uppercase tracking-wide text-faint">Which aircraft</div>
      <div className="mt-2 flex flex-col gap-2 text-sm">
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="share_scope"
            value="all"
            checked={mode === "all"}
            onChange={() => setMode("all")}
            className="mt-1"
          />
          <span>
            <span className="text-ink">All my aircraft</span>
            <span className="block text-xs text-faint">
              Includes any you add later — no need to re-authorize.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="share_scope"
            value="selected"
            checked={mode === "selected"}
            onChange={() => setMode("selected")}
            className="mt-1"
          />
          <span className="text-ink">Only the aircraft I choose</span>
        </label>
      </div>

      {mode === "selected" &&
        (aircraft.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1.5 pl-6 text-sm">
            {aircraft.map((a) => (
              <li key={a.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="aircraft" value={a.id} defaultChecked />
                  <span className="text-ink">{a.tail_number}</span>
                  <span className="text-faint">{[a.make, a.model].filter(Boolean).join(" ")}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 pl-6 text-sm text-dim">
            You have no aircraft yet — pick “All my aircraft” and any you add will be shared.
          </p>
        ))}

      <p className="mt-2 text-xs text-faint">You can change or revoke this anytime in your profile.</p>
    </section>
  );
}

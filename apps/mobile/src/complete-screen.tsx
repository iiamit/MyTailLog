import { useEffect, useState } from "react";
import { getByAircraft } from "./db";
import { queueAction, canEdit } from "./actions";
import { computeAirworthiness } from "./airworthiness";
import { logbookLabel } from "@/lib/logbooks";
import type { LogbookType } from "@/lib/database.types";
import type { StatusItem } from "@/lib/status";
import type { Aircraft } from "./types";
import { TopBar, dim, faint, mono, panel, line, accent, amber, input, primary } from "./ui";

// Mark a recurring item done and reset its counter.
//
// The VOR check is why this screen exists, and it is not just a checkbox:
// 91.171(d) requires the person making the check to record the DATE, PLACE and
// BEARING ERROR, and sign it. Ticking a box that only moved a due-date would
// leave the owner non-compliant while the app told them they were fine. So for
// a VOR check those three fields are required and a real log entry is written
// alongside the counter reset.
//
// Other items (an oil change, a 100-hour) don't carry that rule, so the detail
// is optional there — the counter reset alone is a legitimate record.

type LogbookRow = { id: string; type: LogbookType; title: string | null };

const today = () => new Date().toISOString().slice(0, 10);

export function CompleteItem({
  aircraft,
  item,
  onBack,
  onQueued,
}: {
  aircraft: Aircraft;
  item: StatusItem;
  onBack: () => void;
  onQueued: () => void;
}) {
  const isVor = item.kind === "vor";
  const [date, setDate] = useState(today());
  const [place, setPlace] = useState("");
  const [error, setError] = useState("");
  const [signature, setSignature] = useState("");
  const [notes, setNotes] = useState("");
  const [hours, setHours] = useState("");
  const [logbooks, setLogbooks] = useState<LogbookRow[]>([]);
  const [logbookId, setLogbookId] = useState("");
  const [done, setDone] = useState(false);
  const editable = canEdit(aircraft.id);

  useEffect(() => {
    getByAircraft<LogbookRow>("logbook", aircraft.id).then((rows) => {
      setLogbooks(rows);
      // A VOR check belongs in the aircraft (airframe) log; fall back to
      // avionics, then whatever exists.
      const pick =
        rows.find((r) => r.type === "airframe") ?? rows.find((r) => r.type === "avionics") ?? rows[0];
      if (pick) setLogbookId(pick.id);
    });
    // Prefill the hours on the item's own meter, so the counter resets from the
    // number the countdown is measured against.
    computeAirworthiness(aircraft.id)
      .then((d) => {
        const v = item.meter === "hobbs" ? d.meters.hobbs.hobbs : d.meters.tach.tach;
        if (v != null) setHours(v.toFixed(1));
      })
      .catch(() => {});
  }, [aircraft.id, item.meter]);

  const missing = isVor && (!place.trim() || !error.trim() || !signature.trim() || !logbookId);

  async function save() {
    // 91.171(d) wording, assembled into something that reads like a logbook
    // entry rather than a form dump.
    const description = isVor
      ? `VOR accuracy check — ${place.trim()}, bearing error ${error.trim()}`
      : `${item.label} — completed`;
    const workPerformed = isVor
      ? `VOR receiver accuracy check performed per 14 CFR 91.171. Place: ${place.trim()}. Bearing error: ${error.trim()}.${notes.trim() ? ` ${notes.trim()}` : ""}`
      : notes.trim() || null;

    await queueAction({
      aircraftId: aircraft.id,
      type: "mx_complete",
      label: `${item.label} done ${date}`,
      payload: {
        item_id: item.id,
        date,
        hours: hours.trim() === "" ? null : Number(hours),
        // Only send the entry fields when we actually have a record to write.
        logbook_id: isVor || notes.trim() ? logbookId : null,
        description: isVor || notes.trim() ? description : null,
        work_performed: workPerformed,
        signature_name: signature.trim() || null,
        [item.meter === "hobbs" ? "hobbs" : "tach"]: hours.trim() === "" ? null : Number(hours),
      },
    });
    setDone(true);
    onQueued();
  }

  if (done) {
    return (
      <>
        <TopBar title="Queued" onBack={onBack} />
        <p style={{ color: accent, fontSize: 14, marginTop: 16 }}>
          {item.label} marked done {date}. It uploads on the next sync.
        </p>
        {isVor && (
          <p style={{ color: faint, fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
            A log entry was queued with the place, bearing error and your signature, as 91.171(d)
            requires.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <TopBar title="Mark done" onBack={onBack} />
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{item.label}</div>
        <div style={{ ...mono, color: faint, fontSize: 11, marginTop: 3 }}>
          {item.regulatory ? "REQUIRED" : "ADVISORY"}
          {item.lastDoneDate ? ` · last done ${item.lastDoneDate}` : " · never recorded"}
        </div>
      </div>

      {!editable && (
        <p style={{ color: amber, fontSize: 13, marginTop: 14 }}>
          You have view-only access to this aircraft, so this can&apos;t be saved.
        </p>
      )}

      <Box>
        <Labelled label="Date">
          <input style={{ ...input, width: "100%" }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Labelled>
        <Labelled label={`Hours (${item.meter})`}>
          <input
            style={{ ...input, ...mono, width: "100%" }}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </Labelled>
      </Box>

      {isVor && (
        <Box>
          <p style={{ color: dim, fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
            14 CFR 91.171(d) — record the place, the bearing error, and sign it.
          </p>
          <Labelled label="Place">
            <input
              style={{ ...input, width: "100%" }}
              placeholder="e.g. KCDW VOT, or Solberg VOR 30 nm"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
          </Labelled>
          <Labelled label="Bearing error">
            <input
              style={{ ...input, width: "100%" }}
              placeholder="e.g. +2°, or −1° / +3° (dual)"
              value={error}
              onChange={(e) => setError(e.target.value)}
            />
          </Labelled>
          <Labelled label="Signature">
            <input
              style={{ ...input, width: "100%" }}
              placeholder="Your name"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
            />
          </Labelled>
          <Labelled label="Logbook">
            <select
              style={{ ...input, width: "100%" }}
              value={logbookId}
              onChange={(e) => setLogbookId(e.target.value)}
            >
              {logbooks.length === 0 && <option value="">No logbook on device</option>}
              {logbooks.map((l) => (
                <option key={l.id} value={l.id}>
                  {logbookLabel(l.type, l.title)}
                </option>
              ))}
            </select>
          </Labelled>
        </Box>
      )}

      <Box>
        <Labelled label={isVor ? "Notes (optional)" : "Notes"}>
          <textarea
            style={{ ...input, width: "100%", minHeight: 70, resize: "vertical" }}
            placeholder={isVor ? "Anything else worth recording" : "What was done (optional — writes a log entry)"}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Labelled>
      </Box>

      {missing && (
        <p style={{ color: faint, fontSize: 12, marginTop: 12 }}>
          Place, bearing error, signature and a logbook are all required for a VOR check.
        </p>
      )}

      <button
        onClick={save}
        disabled={!editable || missing}
        style={{ ...primary, width: "100%", marginTop: 12, opacity: !editable || missing ? 0.4 : 1 }}
      >
        Mark done &amp; reset the counter
      </button>
    </>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14, background: panel, border: `1px solid ${line}`, borderRadius: 12, padding: "13px 14px" }}>
      {children}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ color: faint, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

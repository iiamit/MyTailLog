import type { Metadata } from "next";
import { Board, BoardHead, Leaf, Leaves } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { StatusMark } from "@/ui/Marks";
import { HangarShell, loadHangarUser } from "@/ui/HangarShell";
import { AddAircraftForm } from "./AddAircraftForm";

export const metadata: Metadata = { title: "Add an aircraft" };

const BOOKS: [string, string][] = [
  ["Airframe", "Inspections, repairs, ADs and alterations to the airframe"],
  ["Engine", "Overhauls, oil changes, cylinder work and engine ADs"],
  ["Propeller", "Prop overhauls, repairs and prop ADs"],
  ["Avionics", "Radios, transponder, ELT and GPS work, if kept apart"],
  ["Other", "W&B sheets, 8130-3 tags, AD reports. Filed and applied, not split into entries."],
];
const INSPECTIONS: [string, string][] = [
  ["Annual inspection", "91.409 · 12 calendar months"],
  ["Transponder", "91.413 · 24 calendar months"],
  ["Pitot-static and altimeter", "91.411 · 24 months · IFR only"],
  ["ELT inspection", "91.207 · 12 months"],
];

/** W-HANGAR-02 Add an aircraft. No meter readings here; setup asks for them once. */
export default async function NewAircraftPage() {
  const { user, profile, fleet } = await loadHangarUser("/aircraft/new");
  return (
    <HangarShell user={user} profile={profile} fleet={fleet} hangarOpen>
      <Board section="setup">
        <BoardHead title="Add an aircraft" spine={false} actions={<Button variant="on-board" href="/hangar">Cancel</Button>} />
        <Leaves split="1.45fr 1fr">
          <Leaf label="The aircraft">
            <AddAircraftForm />
          </Leaf>
          <Leaf label="What it starts with">
            <h2 className="text-heading">Every aircraft gets five logbooks</h2>
            <ul className="mt-3 divide-y divide-rule">
              {BOOKS.map(([name, what]) => (
                <li key={name} className="py-2">
                  <p className="text-body font-bold">{name}</p>
                  <p className="text-small text-ink-2">{what}</p>
                </li>
              ))}
            </ul>
            <h2 className="mt-6 text-heading">Tracked from day one</h2>
            <ul className="mt-3 divide-y divide-rule">
              {INSPECTIONS.map(([name, rule]) => (
                <li key={name} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="block text-body font-bold">{name}</span>
                    <span className="block text-small text-ink-2">{rule}</span>
                  </span>
                  <StatusMark kind="no_record" label="Needs a date" />
                </li>
              ))}
            </ul>
          </Leaf>
        </Leaves>
      </Board>
    </HangarShell>
  );
}

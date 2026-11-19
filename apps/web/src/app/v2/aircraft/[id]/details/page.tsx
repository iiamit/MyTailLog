import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { lookupRegistration } from "@/lib/faa/registry";
import { aircraftTail } from "@/lib/v2/landing";
import { aircraftTabs } from "@/lib/v2/tabs";
import { fmtDay } from "@/lib/v2/books";
import { registryRows } from "@/lib/v2/details";
import { Board, BoardHead, HungSection, Leaf, Leaves, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { Field, Notice, fieldClass } from "@/ui/Form";
import { ActionForm } from "../equipment/ActionForm";
import { DeleteForm, TransferForm } from "./DangerZone";
import { applyRegistryValue, deleteIt, saveDetails, transfer } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Details · ${await aircraftTail(id)}` };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** W-AIRCRAFT-05 Aircraft details, the FAA registry beside them, and the owner's danger zone. */
export default async function DetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const { done } = await searchParams;
  const supabase = await createClient();
  const [context, { data: ac }] = await Promise.all([
    getAircraftShellContext(supabase, id),
    supabase.from("aircraft").select("tail_number, make, model, year, serial_number, engine_serials, prop_serials, home_base, enrollment_date").eq("id", id).maybeSingle(),
  ]);
  if (!context || !ac) notFound();
  const a = `/aircraft/${id}`;
  const owner = context.isOwner;
  const tail = ac.tail_number;

  const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const counts = owner
    ? await Promise.all([
        count(supabase.from("page").select("id", { count: "exact", head: true }).eq("aircraft_id", id)),
        count(supabase.from("log_entry").select("id", { count: "exact", head: true }).eq("aircraft_id", id)),
        count(supabase.from("document").select("id", { count: "exact", head: true }).eq("aircraft_id", id)),
        count(supabase.from("maintenance_item").select("id", { count: "exact", head: true }).eq("aircraft_id", id)),
        count(supabase.from("record_room").select("id", { count: "exact", head: true }).eq("aircraft_id", id).is("revoked_at", null).gt("expires_at", new Date().toISOString())),
      ])
    : null;

  const input = (name: string, label: string, value: string | number | null | undefined, opts: { help?: string; type?: string } = {}) => (
    <Field label={label} help={opts.help}>
      <input name={name} type={opts.type ?? "text"} defaultValue={value ?? ""} readOnly={!owner} className={`${fieldClass} read-only:bg-leaf-2`} />
    </Field>
  );
  const fields = (
    <>
      <HungSection title="The aircraft" first>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tail number" help="The tail number can't be changed. Transfer or add a new aircraft instead.">
            <input value={tail} readOnly className={`${fieldClass} bg-leaf-2`} />
          </Field>
          {input("year", "Year", ac.year, { type: "number" })}
          {input("make", "Make", ac.make)}
          {input("model", "Model", ac.model)}
          {input("serial_number", "Serial number", ac.serial_number)}
          {input("home_base", "Home base", ac.home_base, { help: "Private to you." })}
        </div>
      </HungSection>
      <HungSection title="Engine and prop">
        <div className="grid gap-4">
          {input("engine_serials", "Engine serial numbers", (ac.engine_serials ?? []).join(", "), { help: "Separate several with commas." })}
          {input("prop_serials", "Propeller serial numbers", (ac.prop_serials ?? []).join(", "), { help: "Separate several with commas." })}
        </div>
        <p className="mt-3 text-small text-ink-2">
          Meters are set on{" "}
          <Link href={`${a}/hours`} className="font-semibold text-board-ink underline decoration-dotted">Hours and engine</Link>.
        </p>
      </HungSection>
    </>
  );

  return (
    <Board section="aircraft">
      <BoardHead title="Aircraft" subTabs={aircraftTabs(id, "details")} />
      <Spine tail={context.reg} context="The whole life" href={`${a}/logbooks/map`} />
      <Leaves split="1.6fr 1fr">
        <Leaf label="Aircraft details">
          <div className="mb-4 space-y-3">
            {done === "saved" && <Notice>Details saved.</Notice>}
            {done === "error" && <Notice tone="alarm">That didn&apos;t save. Reload the page and try again.</Notice>}
            {!owner && <p className="text-body text-ink-2">Only the owner can change these details.</p>}
          </div>
          {owner ? <ActionForm action={saveDetails.bind(null, id)} submit="Save details" className="flex flex-col gap-2">{fields}</ActionForm> : fields}

          {owner && counts && (
            <>
              <section id="transfer" className="mt-8 border-t-2 border-ink pt-4">
                <h2 className="text-section">Transfer to a new owner</h2>
                <p className="mt-1 mb-3 max-w-[56ch] text-body text-ink-2">
                  Moves {tail} and all its records to another MyTailLog account. They must already have an account. Live record room and mechanic links are revoked.
                </p>
                <TransferForm action={transfer.bind(null, id)} tail={tail} />
              </section>
              <section id="delete" className="mt-8 border-t-2 border-alarm pt-4">
                <h2 className="text-section text-alarm-text">Delete {tail}</h2>
                <p className="mt-1 mb-3 max-w-[56ch] text-body text-ink-2">
                  This removes {plural(counts[0], "page scan")}, {plural(counts[1], "entry", "entries")}, {plural(counts[2], "document")},{" "}
                  {plural(counts[3], "tracked item")} and {plural(counts[4], "live record room link")}. It can&apos;t be undone.{" "}
                  <Link href={`${a}/export`} className="font-semibold text-board-ink underline decoration-dotted">Download a backup first</Link>
                </p>
                <DeleteForm action={deleteIt.bind(null, id, tail)} tail={tail} cancelHref={`${a}/details`} />
              </section>
            </>
          )}
        </Leaf>
        <Leaf label="FAA registry">
          <Suspense fallback={<p className="text-body text-ink-3">Checking the FAA registry for {tail}…</p>}>
            <Registry aircraftId={id} tail={tail} ours={ac} owner={owner} />
          </Suspense>
        </Leaf>
      </Leaves>
    </Board>
  );
}

/** Right leaf: the public FAA registry record, compared field by field. Fetched after the page so a slow FAA never blocks it. */
async function Registry({
  aircraftId,
  tail,
  ours,
  owner,
}: {
  aircraftId: string;
  tail: string;
  ours: { make: string | null; model: string | null; serial_number: string | null; year: number | null };
  owner: boolean;
}) {
  const rec = await lookupRegistration(tail);
  const again = <Button size="s" href={`/aircraft/${aircraftId}/details`}>Check again</Button>;
  if (!rec)
    return (
      <>
        <h2 className="text-heading">FAA aircraft registry, {tail}</h2>
        <p className="mt-3 mb-3 text-body text-ink-2">The FAA registry couldn&apos;t be reached, or has no record for {tail}. Try again later.</p>
        {again}
      </>
    );
  const { rows, agree, compared } = registryRows(ours, rec);
  return (
    <>
      <h2 className="text-heading">FAA aircraft registry, {tail}</h2>
      <p className="mt-1 mb-3 text-small text-ink-3">
        Checked {fmtDay(new Date().toISOString().slice(0, 10))} · agrees with your details on {agree} of {compared} fields
      </p>
      {again}
      <dl className="mt-4 divide-y divide-rule">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[130px_1fr] gap-3 py-2">
            <dt className="text-small text-ink-3">{r.label}</dt>
            <dd className="text-body">
              {r.theirs}
              {r.differs && (
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-small font-semibold text-alarm-text">
                  Differs from your details
                  {owner && r.field && (
                    <form action={applyRegistryValue.bind(null, aircraftId, r.field, r.theirs)}>
                      <button type="submit" className={buttonClass("quiet", "s")}>Use the registry&apos;s</button>
                    </form>
                  )}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-small text-ink-3">
        The Mode S code lets MyTailLog look for ADS-B flights on Hours and engine. Registry data is public; nothing about you is sent to look it up.
      </p>
    </>
  );
}

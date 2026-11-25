import { RecordVersion } from "@/components/RecordVersion";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel } from "@/lib/mapModel";
import { aircraftTail } from "@/lib/v2/landing";
import { aircraftTabs } from "@/lib/v2/tabs";
import { entryTitle, fmtDay } from "@/lib/v2/books";
import { adPhrase, equipmentVerdict, pageLabels, type LinkedAd } from "@/lib/v2/equipment";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Field, FormLeaf, Notice, fieldClass } from "@/ui/Form";
import { TrustMark, YourNote } from "@/ui/Marks";
import { ScanViewer } from "@/ui/ScanViewer";
import type { Component } from "@/lib/database.types";
import { ActionForm, SelectAll } from "./ActionForm";
import { ScanButton } from "./ScanButton";
import { addProposals, deleteComponent, dismissProposals, markRemoved, reinstallComponent, saveComponent } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Equipment · ${await aircraftTail(id)}` };
}

const CATEGORIES: [string, string][] = [["airframe", "Airframe"], ["engine", "Engine"], ["prop", "Propeller"], ["avionics", "Avionics"], ["other", "Other"]];
const DONE: Record<string, (n: number) => string> = {
  saved: () => "Equipment saved.",
  removed: (n) => (n > 0 ? `Removed. ${n} ${n === 1 ? "AD" : "ADs"} marked not applicable.` : "Removed."),
  reinstalled: () => "Reinstalled. Its ADs keep the status they have; check them in ADs and SBs.",
  deleted: () => "Deleted from the equipment list.",
  added: (n) => `Added ${n} ${n === 1 ? "part" : "parts"} from the logs.`,
  dismissed: (n) => `${n === 1 ? "Suggestion" : `${n} suggestions`} set aside.`,
};

const proposalDate = (p: { is_installed: boolean; install_date: string | null; removal_date: string | null }) =>
  (p.is_installed ? p.install_date : p.removal_date) ?? p.install_date;

type SP = { part?: string; proposal?: string; panel?: string; done?: string; n?: string; error?: string };

/** W-AIRCRAFT-03 Equipment: what is installed, what came out, and what the logbooks suggest. */
export default async function EquipmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/equipment`;
  const edit = context.canEdit;

  const [{ data: components, error }, { data: ads }, { data: proposals }, { data: entries }, due] = await Promise.all([
    supabase.from("component").select("*").eq("aircraft_id", id).order("category", { nullsFirst: false }).order("name"),
    supabase.from("ad_compliance").select("component_id, reference, kind, status, recurring, interval_hours, interval_months").eq("aircraft_id", id).not("component_id", "is", null),
    supabase.from("equipment_proposal").select("*").eq("aircraft_id", id).order("created_at", { ascending: false }),
    supabase.from("log_entry").select("id, entry_date, entry_kind, description, work_performed, page_id").eq("aircraft_id", id).eq("owner_confirmed", true).order("entry_date", { ascending: false }).limit(400),
    dueSnapshot(id, auth.user.id).catch(() => null),
  ]);
  const all = components ?? [];
  const installed = all.filter((c) => c.is_installed);
  const removed = all.filter((c) => !c.is_installed);
  const props = proposals ?? [];
  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));
  const adsByPart = new Map<string, LinkedAd[]>();
  for (const ad of ads ?? []) if (ad.component_id) adsByPart.set(ad.component_id, [...(adsByPart.get(ad.component_id) ?? []), ad]);
  const labels = await pageLabels(supabase, id, [...props.map((p) => p.page_id), ...all.map((c) => (c.install_entry_id ? entryById.get(c.install_entry_id)?.page_id : null))]);
  const installPage = (c: Component) => (c.install_entry_id ? entryById.get(c.install_entry_id)?.page_id ?? null : null);

  const part = all.find((c) => c.id === sp.part) ?? null;
  const proposal = props.find((p) => p.id === sp.proposal) ?? null;
  const panel = edit ? sp.panel : undefined;
  const today = due?.loaded.today ?? new Date().toISOString().slice(0, 10);
  const model = due ? buildMapModel(due.loaded.input, due.loaded.today) : null;

  const entryOptions = (selected: string | null) => (
    <>
      <option value="">{selected ? "Not linked" : "None yet"}</option>
      {(entries ?? []).map((e) => (
        <option key={e.id} value={e.id}>
          {e.entry_date ? fmtDay(e.entry_date) : "No date"} · {entryTitle(e)}
          {e.page_id && labels.get(e.page_id) ? ` · ${labels.get(e.page_id)}` : ""}
        </option>
      ))}
    </>
  );

  // Right leaf: a form, or the page behind the selection (W-AIRCRAFT-03).
  let right: React.ReactNode;
  if (panel === "new" || (panel === "edit" && part)) {
    const c = panel === "edit" ? part : null;
    right = (
      <FormLeaf title={c ? `Edit ${c.name}` : "Add equipment"} closeHref={c ? `${self}?part=${c.id}` : self}>
        <ActionForm action={saveComponent.bind(null, id, c?.id ?? null, c?.updated_at ?? null)} submit="Save" extra={<Link href={c ? `${self}?part=${c.id}` : self} className={buttonClass("quiet", "m")}>Cancel</Link>}>
          {c && <RecordVersion key={c.id} base={c.updated_at} />}
          <Field label="Name">
            <input name="name" required defaultValue={c?.name ?? ""} placeholder="e.g. Vacuum pump" className={fieldClass} />
          </Field>
          <Field label="Manufacturer" help="Decides which ADs apply to this part.">
            <input name="make" defaultValue={c?.make ?? ""} className={fieldClass} />
          </Field>
          <Field label="Model"><input name="model" defaultValue={c?.model ?? ""} className={fieldClass} /></Field>
          <Field label="Category">
            <select name="category" defaultValue={c?.category ?? ""} className={fieldClass}>
              <option value="">Not set</option>
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="This record represents" help="Engine-system accessories are not complete engines in Engine history.">
            <select name="component_kind" defaultValue={c?.component_kind ?? ""} className={fieldClass}>
              <option value="">Not classified</option><option value="engine">Complete engine</option><option value="propeller">Complete propeller</option><option value="accessory">Accessory or engine part</option><option value="equipment">Other equipment</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Part number"><input name="part_number" defaultValue={c?.part_number ?? ""} className={fieldClass} /></Field>
            <Field label="Serial number"><input name="serial_number" defaultValue={c?.serial_number ?? ""} className={fieldClass} /></Field>
          </div>
          <Field label="Installed on"><input name="install_date" type="date" max={today} defaultValue={c?.install_date ?? ""} className={fieldClass} /></Field>
          <Field label="Install entry">
            <select name="install_entry_id" defaultValue={c?.install_entry_id ?? ""} className={fieldClass}>{entryOptions(c?.install_entry_id ?? null)}</select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Life limit"><input name="life_limit_value" type="number" min="0" step="any" inputMode="decimal" defaultValue={c?.life_limit_value ?? ""} className={fieldClass} /></Field>
            <Field label="Unit">
              <select name="life_limit_unit" defaultValue={c?.life_limit_unit ?? ""} className={fieldClass}>
                <option value="">None</option>
                <option value="hours">Hours</option>
                <option value="months">Months</option>
                <option value="cycles">Cycles</option>
              </select>
            </Field>
          </div>
          <Field label="Notes"><textarea name="notes" rows={3} defaultValue={c?.notes ?? ""} className={`${fieldClass} h-auto py-2`} /></Field>
        </ActionForm>
      </FormLeaf>
    );
  } else if (panel === "remove" && part?.is_installed) {
    const n = adsByPart.get(part.id)?.filter((x) => x.status !== "not_applicable" && x.status !== "superseded").length ?? 0;
    right = (
      <FormLeaf title={`Mark ${part.name} removed`} closeHref={`${self}?part=${part.id}`}>
        <ActionForm action={markRemoved.bind(null, id, part.id, part.updated_at)} submit="Mark removed" extra={<Link href={`${self}?part=${part.id}`} className={buttonClass("quiet", "m")}>Cancel</Link>}>
          <Field label="Removed on"><input name="removal_date" type="date" required max={today} defaultValue={today} className={fieldClass} /></Field>
          <Field label="Removal entry"><select name="removal_entry_id" defaultValue="" className={fieldClass}>{entryOptions(null)}</select></Field>
          <p className="text-small text-ink-2">
            {n > 0 ? `${n} ${n === 1 ? "AD" : "ADs"} linked to this part will be marked not applicable from that date.` : "No open ADs are linked to this part."}
          </p>
        </ActionForm>
      </FormLeaf>
    );
  } else {
    const pageId = proposal?.page_id ?? (part ? installPage(part) : null);
    const label = pageId ? labels.get(pageId) ?? "Logbook page" : null;
    right = (
      <SourceMat
        title={pageId ? label! : undefined}
        meta={proposal ? `${proposal.name} · read by AI, not confirmed` : part ? `${part.name}, installed ${part.install_date ? fmtDay(part.install_date) : "date unknown"}` : undefined}
      >
        {pageId ? (
          <>
            <ScanViewer src={`/api/page/${pageId}/image`} alt={`${label}, scanned page`} />
            {proposal?.source && <p className="text-paper text-on-cover">&ldquo;{proposal.source}&rdquo;</p>}
          </>
        ) : proposal || part ? (
          <p className="m-auto max-w-[300px] text-center text-[15px] text-on-cover-2">
            {proposal ? "This suggestion has no page attached." : "No install entry is linked. Edit the part to link the entry that records it."}
          </p>
        ) : undefined}
      </SourceMat>
    );
  }

  const scanOk = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  const done = sp.done && DONE[sp.done] ? DONE[sp.done](Number(sp.n ?? 0)) : null;
  const win = part?.install_date ? { from: part.install_date, to: part.removal_date ?? today } : null;

  return (
    <Board section="aircraft">
      <BoardHead
        title="Aircraft"
        subTabs={aircraftTabs(id, "equipment")}
        actions={edit && <Button variant="on-board" href={`${self}?panel=new`}>Add equipment</Button>}
      />
      <Spine tail={context.reg} context={part ? part.name : "The whole life"} href={`${a}/logbooks/map`} model={model} window={win} />
      <Leaves split="2.1fr 1fr">
        <Leaf label="Equipment">
          <div className="mb-4 space-y-3">
            {done && <Notice>{done}</Notice>}
            {sp.error && <Notice tone="alarm">That didn&apos;t save. Reload the page and try again.</Notice>}
            {error && <Notice tone="alarm">Equipment could not be loaded.</Notice>}
          </div>
          <p className="mb-5 max-w-[52ch] text-lede">{equipmentVerdict(installed.length, removed.length, props.length)}</p>

          {props.length > 0 && (
            <HungSection title="Found in the logs" count={`${props.length} to answer`} first>
              <p className="mb-1"><TrustMark level="ai_read" label="read by AI, not confirmed" /></p>
              <form>
                <ul className="divide-y divide-rule">
                  {props.map((p) => (
                    <li key={p.id} className={`flex items-start gap-3 py-3 ${p.id === proposal?.id ? "bg-leaf-2 -mx-2 px-2" : ""}`}>
                      {edit && <input type="checkbox" name="ids" value={p.id} defaultChecked aria-label={`Select ${p.name}`} className="mt-1 size-4" />}
                      <div className="min-w-0 flex-1">
                        <Link href={`${self}?proposal=${p.id}`} replace scroll={false} className="text-body-strong hover:underline">
                          {p.name}{p.make ? `, ${p.make}` : ""}
                        </Link>
                        <p className="text-small text-ink-3">
                          {p.is_installed ? "installed" : "removed"} {proposalDate(p) ? fmtDay(proposalDate(p)!) : "date not read"}
                          {p.page_id && labels.get(p.page_id) && (
                            <> · <Link href={`${self}?proposal=${p.id}`} replace scroll={false} className="text-board-ink underline decoration-dotted underline-offset-[3px]">{labels.get(p.page_id)}</Link></>
                          )}
                          {[p.part_number && `P/N ${p.part_number}`, p.serial_number && `S/N ${p.serial_number}`].filter(Boolean).map((t) => ` · ${t}`)}
                        </p>
                      </div>
                      {edit && (
                        <div className="flex shrink-0 gap-1">
                          <button name="one" value={p.id} formAction={addProposals.bind(null, id)} className={buttonClass("secondary", "s")}>Add it</button>
                          <button name="one" value={p.id} formAction={dismissProposals.bind(null, id)} className={buttonClass("quiet", "s")}>Not equipment</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {edit && props.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SelectAll name="ids" />
                    <button formAction={addProposals.bind(null, id)} className={buttonClass("primary", "s")}>Add selected</button>
                    <button formAction={dismissProposals.bind(null, id)} className={buttonClass("quiet", "s")}>Dismiss selected</button>
                  </div>
                )}
              </form>
            </HungSection>
          )}

          {edit && scanOk && <div className="mb-2"><ScanButton aircraftId={id} /></div>}

          {all.length === 0 && props.length === 0 ? (
            <p className="mt-4 max-w-[48ch] border-t-2 border-ink pt-4 text-body text-ink-2">
              No equipment tracked yet. Find it in the logs, or add parts by hand. Installed parts decide which ADs apply.
            </p>
          ) : (
            <HungSection title="Installed" count={`${installed.length}`} first={props.length === 0}>
              {installed.length === 0 ? (
                <p className="text-body text-ink-2">Nothing is marked installed.</p>
              ) : (
                <table className="w-full text-left text-small">
                  <thead className="text-label text-ink-3">
                    <tr className="border-b border-rule">
                      <th className="py-2 pr-3 font-semibold">Part</th>
                      <th className="py-2 pr-3 font-semibold">Make and part number</th>
                      <th className="py-2 pr-3 font-semibold">Installed</th>
                      <th className="py-2 pr-3 font-semibold">ADs</th>
                      {edit && <th className="py-2"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {installed.map((c) => {
                      const pg = installPage(c);
                      const linked = adsByPart.get(c.id) ?? [];
                      return (
                        <tr key={c.id} aria-current={c.id === part?.id ? "true" : undefined} className="border-b border-rule align-top aria-[current]:bg-leaf-2">
                          <td className="py-2.5 pr-3">
                            <Link href={`${self}?part=${c.id}`} replace scroll={false} className="text-body-strong hover:underline">{c.name}</Link>
                            {c.life_limit_value != null && <span className="block text-caption text-ink-3">life {c.life_limit_value} {c.life_limit_unit ?? ""}</span>}
                          </td>
                          <td className="py-2.5 pr-3 text-ink-2">
                            {[c.make, c.part_number && `P/N ${c.part_number}`, c.serial_number && `S/N ${c.serial_number}`].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {c.install_date ? fmtDay(c.install_date) : "date unknown"}
                            <span className="block text-caption">
                              {pg && labels.get(pg) ? (
                                <Link href={`${self}?part=${c.id}`} replace scroll={false} className="text-board-ink underline decoration-dotted underline-offset-[3px]">{labels.get(pg)}</Link>
                              ) : (
                                <YourNote />
                              )}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-ink-2">
                            {linked.length ? linked.map((ad) => <span key={ad.reference} className="block">{adPhrase(ad)}</span>) : "None"}
                          </td>
                          {edit && (
                            <td className="py-2 text-right whitespace-nowrap">
                              <Link href={`${self}?part=${c.id}&panel=edit`} className={buttonClass("quiet", "s")}>Edit</Link>
                              <Link href={`${self}?part=${c.id}&panel=remove`} className={buttonClass("quiet", "s")}>Mark removed</Link>
                              <form action={deleteComponent.bind(null, id, c.id, c.updated_at)} className="inline">
                                <ConfirmSubmit label="Delete" question={`Delete ${c.name} from the equipment list? Use Mark removed if it came out of the aircraft.`} />
                              </form>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </HungSection>
          )}

          {removed.length > 0 && (
            <HungSection title="Historical or removed equipment" count={`${removed.length}`}>
              <ul className="divide-y divide-rule">
                {removed.map((c) => {
                  const na = (adsByPart.get(c.id) ?? []).filter((x) => x.status === "not_applicable").length;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 text-ink-2">
                      <Link href={`${self}?part=${c.id}`} replace scroll={false} className="min-w-0 flex-1 text-body hover:underline">
                        {c.name}{[c.make, c.model].filter(Boolean).length ? `, ${[c.make, c.model].filter(Boolean).join(" ")}` : ""} {c.identity_historical ? "· historical record; current installation not confirmed" : `removed ${c.removal_date ? fmtDay(c.removal_date) : "(date unknown)"}`}
                        {na > 0 && <span className="block text-small text-ink-3">its {na === 1 ? "AD" : `${na} ADs`} marked not applicable from that date</span>}
                      </Link>
                      {edit && (
                        <span className="flex gap-1">
                          <form action={reinstallComponent.bind(null, id, c.id, c.updated_at)}>
                            <button type="submit" className={buttonClass("quiet", "s")}>Reinstall</button>
                          </form>
                          <Link href={`${self}?part=${c.id}&panel=edit`} className={buttonClass("quiet", "s")}>Edit</Link>
                          <form action={deleteComponent.bind(null, id, c.id, c.updated_at)}>
                            <ConfirmSubmit label="Delete" question={`Delete ${c.name} from the equipment list? Its history goes with it.`} />
                          </form>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </HungSection>
          )}
        </Leaf>
        {right}
      </Leaves>
    </Board>
  );
}

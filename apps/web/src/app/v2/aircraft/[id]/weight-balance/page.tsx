import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel } from "@/lib/mapModel";
import { staleWBChanges, usefulLoad, type EquipChange } from "@/lib/weightBalance";
import { aircraftTail } from "@/lib/v2/landing";
import { aircraftTabs } from "@/lib/v2/tabs";
import { fmtDay, fmtMonth } from "@/lib/v2/books";
import { pageLabels } from "@/lib/v2/equipment";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Field, FormLeaf, Notice, fieldClass } from "@/ui/Form";
import { YourNote } from "@/ui/Marks";
import { ScanViewer } from "@/ui/ScanViewer";
import { ActionForm } from "../equipment/ActionForm";
import { WbTriple } from "./WbTriple";
import { deleteRevision, saveRevision } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Weight and balance · ${await aircraftTail(id)}` };
}

const fmt = (n: number | null, dp = 1) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: dp }));
const METHOD: Record<string, string> = { weighed: "Weighed", computed: "Computed" };

type SP = { revision?: string; panel?: string; done?: string };

/** W-AIRCRAFT-04 Weight and balance: an index of the W&B paperwork, never a loading calculator. */
export default async function WeightBalancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/weight-balance`;
  const edit = context.canEdit;

  const [{ data: revisions, error }, { data: components }, due] = await Promise.all([
    supabase.from("weight_balance").select("*").eq("aircraft_id", id).order("revision_date", { ascending: false }),
    supabase.from("component").select("name, install_date, removal_date").eq("aircraft_id", id),
    dueSnapshot(id, auth.user.id).catch(() => null),
  ]);
  const rows = revisions ?? [];
  const current = rows[0] ?? null;
  const changes: EquipChange[] = [];
  for (const c of components ?? []) {
    if (c.install_date) changes.push({ name: c.name, date: c.install_date, kind: "install" });
    if (c.removal_date) changes.push({ name: c.name, date: c.removal_date, kind: "removal" });
  }
  // Only meaningful once a revision exists; with none, the empty state asks for the current figures.
  const stale = current ? staleWBChanges(current.revision_date, changes) : [];
  const labels = await pageLabels(supabase, id, rows.map((r) => r.source_page_id));
  const selected = rows.find((r) => r.id === sp.revision) ?? null;
  const panel = edit ? sp.panel : undefined;
  const today = due?.loaded.today ?? new Date().toISOString().slice(0, 10);
  const model = due ? buildMapModel(due.loaded.input, due.loaded.today) : null;
  const useful = current ? usefulLoad(current.empty_weight, current.max_gross_weight) : null;

  let right: React.ReactNode;
  if (panel === "new" || (panel === "edit" && selected)) {
    const r = panel === "edit" ? selected : null;
    const close = r ? `${self}?revision=${r.id}` : self;
    right = (
      <FormLeaf title={r ? `Edit the ${fmtDay(r.revision_date)} revision` : "Add a revision"} closeHref={close}>
        <ActionForm action={saveRevision.bind(null, id, r?.id ?? null)} submit="Save" extra={<Link href={close} className={buttonClass("quiet", "m")}>Cancel</Link>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Revision date"><input name="revision_date" type="date" required max={today} defaultValue={r?.revision_date ?? ""} className={fieldClass} /></Field>
            <Field label="Method">
              <select name="method" defaultValue={r?.method ?? ""} className={fieldClass}>
                <option value="">Not stated</option>
                <option value="weighed">Weighed</option>
                <option value="computed">Computed</option>
              </select>
            </Field>
          </div>
          <WbTriple weight={r?.empty_weight ?? null} arm={r?.empty_weight_arm ?? null} moment={r?.empty_weight_moment ?? null} />
          <Field label="Max gross weight (lb)"><input name="max_gross_weight" type="number" min="0" step="any" inputMode="decimal" defaultValue={r?.max_gross_weight ?? current?.max_gross_weight ?? ""} className={fieldClass} /></Field>
          <Field label="Reason"><input name="reason" defaultValue={r?.reason ?? ""} placeholder="e.g. Installed GTN 650, removed KX-155" className={fieldClass} /></Field>
          <Field label="Reference"><input name="reference" defaultValue={r?.reference ?? ""} placeholder="Form 337 or document" className={fieldClass} /></Field>
          <Field label="Notes"><textarea name="notes" rows={3} defaultValue={r?.notes ?? ""} className={`${fieldClass} h-auto py-2`} /></Field>
        </ActionForm>
      </FormLeaf>
    );
  } else {
    const r = selected ?? current;
    const pageId = r?.source_page_id ?? null;
    right = (
      <SourceMat title={pageId ? labels.get(pageId) ?? "Logbook page" : undefined} meta={r && pageId ? `Revision of ${fmtDay(r.revision_date)}` : undefined}>
        {pageId ? (
          <ScanViewer src={`/api/page/${pageId}/image`} alt={`${labels.get(pageId) ?? "Logbook page"}, scanned page`} />
        ) : r ? (
          <p className="m-auto max-w-[300px] text-center text-[15px] text-on-cover-2">
            No page is linked to the {fmtDay(r.revision_date)} revision.{r.reference ? ` Its reference: ${r.reference}.` : ""}
          </p>
        ) : undefined}
      </SourceMat>
    );
  }

  const done = sp.done === "saved" ? "Revision saved." : sp.done === "deleted" ? "Revision deleted." : null;

  return (
    <Board section="aircraft">
      <BoardHead
        title="Aircraft"
        subTabs={aircraftTabs(id, "weight-balance")}
        actions={edit && <Button variant="on-board" href={`${self}?panel=new`}>Add a revision</Button>}
      />
      <Spine
        tail={context.reg}
        context={current ? "Since the last revision" : "The whole life"}
        href={`${a}/logbooks/map`}
        model={model}
        window={current ? { from: current.revision_date, to: today } : null}
      />
      <Leaves split="1.6fr 1fr">
        <Leaf label="Weight and balance">
          <div className="mb-4 space-y-3">
            {done && <Notice>{done}</Notice>}
            {sp.done === "error" && <Notice tone="alarm">That revision could not be deleted. Reload and try again.</Notice>}
            {error && <Notice tone="alarm">Weight and balance could not be loaded.</Notice>}
          </div>

          {stale.length > 0 && (
            <div className="mb-5 rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3.5 text-body">
              <p>
                <strong>These figures may be stale.</strong>{" "}
                {stale.length === 1
                  ? `${stale[0].name} ${stale[0].kind === "install" ? "went in" : "came out"} during ${fmtMonth(stale[0].date)}, after the last revision.`
                  : `${stale.length} equipment changes came after the last revision.`}{" "}
                If the weight changed, add a revision from the new paperwork.
              </p>
              {stale.length > 1 && (
                <ul className="mt-2 list-disc pl-5 text-small text-ink-2">
                  {stale.slice(0, 8).map((c) => (
                    <li key={`${c.date}-${c.name}-${c.kind}`}>{fmtDay(c.date)}, {c.kind === "install" ? "installed" : "removed"} {c.name}</li>
                  ))}
                </ul>
              )}
              <Link href={`${a}/equipment`} className="mt-2 inline-block text-small font-semibold text-board-ink underline decoration-dotted">See equipment</Link>
            </div>
          )}

          {!current ? (
            <p className="max-w-[48ch] border-t-2 border-ink pt-4 text-body text-ink-2">
              No weight and balance revision recorded yet. Add the current figures from the aircraft&apos;s paperwork.
            </p>
          ) : (
            <>
              <HungSection title="Current figures" first>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 tabular-nums">
                  <dt className="text-ink-2">Empty weight</dt><dd className="text-body-strong">{fmt(current.empty_weight)} lb</dd>
                  <dt className="text-ink-2">CG arm</dt><dd className="text-body-strong">{fmt(current.empty_weight_arm, 2)} in</dd>
                  <dt className="text-ink-2">Moment</dt><dd className="text-body-strong">{fmt(current.empty_weight_moment, 0)} lb-in</dd>
                  <dt className="text-ink-2">Useful load</dt><dd className="text-body-strong">{useful == null ? "needs max gross weight" : `${fmt(useful)} lb`}</dd>
                </dl>
                <p className="mt-2 text-small text-ink-3">
                  {[`As of ${fmtDay(current.revision_date)}`, current.method && METHOD[current.method], current.max_gross_weight != null && `max gross ${fmt(current.max_gross_weight)} lb`, current.reference]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-3 text-small text-ink-2">Add the envelope from the POH to see revisions against it.</p>
              </HungSection>

              <HungSection title="Revisions" count={`${rows.length}`}>
                <table className="w-full text-left text-small tabular-nums">
                  <thead className="text-label text-ink-3">
                    <tr className="border-b border-rule">
                      <th className="py-2 pr-3 font-semibold">Date</th>
                      <th className="py-2 pr-3 font-semibold">Method</th>
                      <th className="py-2 pr-3 text-right font-semibold">Empty wt</th>
                      <th className="py-2 pr-3 text-right font-semibold">Arm</th>
                      <th className="py-2 pr-3 text-right font-semibold">Moment</th>
                      <th className="py-2 pr-3 font-semibold">Why</th>
                      <th className="py-2 pr-3 font-semibold">Source</th>
                      {edit && <th className="py-2"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id} aria-current={r.id === selected?.id ? "true" : undefined} className="border-b border-rule align-top aria-[current]:bg-leaf-2">
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <Link href={`${self}?revision=${r.id}`} replace scroll={false} className="font-semibold hover:underline">{fmtDay(r.revision_date)}</Link>
                          {i === 0 && <span className="ml-1.5 rounded-[var(--radius-s)] border border-ink px-1 text-label">Current</span>}
                        </td>
                        <td className="py-2.5 pr-3">{r.method ? METHOD[r.method] : "—"}</td>
                        <td className="py-2.5 pr-3 text-right">{fmt(r.empty_weight)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmt(r.empty_weight_arm, 2)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmt(r.empty_weight_moment, 0)}</td>
                        <td className="py-2.5 pr-3 text-ink-2">{r.reason ?? "—"}</td>
                        <td className="py-2.5 pr-3">
                          {r.source_page_id && labels.get(r.source_page_id) ? (
                            <Link href={`${self}?revision=${r.id}`} replace scroll={false} className="text-board-ink underline decoration-dotted underline-offset-[3px]">{labels.get(r.source_page_id)}</Link>
                          ) : r.reference ? (
                            <span className="text-ink-2">{r.reference}</span>
                          ) : (
                            <YourNote />
                          )}
                        </td>
                        {edit && (
                          <td className="py-2 text-right whitespace-nowrap">
                            <Link href={`${self}?revision=${r.id}&panel=edit`} className={buttonClass("quiet", "s")}>Edit</Link>
                            <form action={deleteRevision.bind(null, id, r.id)} className="inline">
                              <ConfirmSubmit label="Delete" question={`Delete the ${fmtDay(r.revision_date)} revision? The paperwork itself is not affected.`} />
                            </form>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </HungSection>
            </>
          )}
          <p className="mt-5 text-small text-ink-3">
            An index of the W&amp;B paperwork, not a loading calculator. The signed report kept with the aircraft is the one that counts.
          </p>
        </Leaf>
        {right}
      </Leaves>
    </Board>
  );
}

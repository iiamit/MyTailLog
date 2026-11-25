import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { fmtDate } from "@/lib/due/engine";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel } from "@/lib/mapModel";
import { staleWBChanges, type EquipChange } from "@/lib/weightBalance";
import { aircraftTail } from "@/lib/v2/landing";
import { leftText } from "@/lib/v2/status";
import { DOC_LABEL, DOCUMENT_TYPES, carryAboard, docTitle, docsGap, matchesQuery, plural } from "@/lib/v2/docs";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Notice, fieldClass } from "@/ui/Form";
import { StatusMark } from "@/ui/Marks";
import { ScanViewer } from "@/ui/ScanViewer";
import { DocForm, type EntryOption } from "./DocForm";
import { PrintButton } from "./PrintButton";
import { deleteDocument, unlinkDocument } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Documents · ${await aircraftTail(id)}` };
}

const DONE: Record<string, string> = {
  added: "Document added.",
  saved: "Details saved.",
  unlinked: "Unlinked. It's still in Documents.",
  deleted: "Document deleted.",
  failed: "The document could not be changed. Reload it and try again; another device may have updated it.",
};

const summary = (e: { description: string | null; work_performed: string | null }) => {
  const t = (e.description || e.work_performed || "").trim();
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
};

function fmtSize(n: number | null) {
  if (!n) return null;
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Print only the carry-aboard list (C-DOCS-02); the rail and board stay on screen.
const PRINT_CSS =
  "@media print { body * { visibility: hidden !important; } #carry-aboard, #carry-aboard * { visibility: visible !important; } #carry-aboard { position: absolute; inset: 0 auto auto 0; width: 100%; } }";

/** W-DOCS-01 Documents vault and carry-aboard card. */
export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string; panel?: string; q?: string; done?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/documents`;
  const canEdit = context.canEdit;

  const [docsRes, entriesRes, wbRes, partsRes, due] = await Promise.all([
    supabase
      .from("document")
      .select("id, type, title, reference, document_date, notes, file_name, mime_type, size_bytes, log_entry_id, created_at, updated_at, track_expiry, expires_on, renews_every_months, remind_lead_days")
      .eq("aircraft_id", id)
      .order("created_at", { ascending: false }),
    canEdit
      ? supabase
          .from("log_entry")
          .select("id, entry_date, description, work_performed")
          .eq("aircraft_id", id)
          .eq("owner_confirmed", true)
          .order("entry_date", { ascending: false, nullsFirst: false })
          .limit(500)
      : Promise.resolve({ data: [] as { id: string; entry_date: string | null; description: string | null; work_performed: string | null }[] }),
    supabase.from("weight_balance").select("revision_date").eq("aircraft_id", id).order("revision_date", { ascending: false }).limit(1),
    supabase.from("component").select("name, install_date, removal_date").eq("aircraft_id", id),
    dueSnapshot(id, auth.user.id).catch(() => null),
  ]);

  if (docsRes.error) {
    return (
      <Board section="docs">
        <BoardHead title="Documents" actions={<Link href={`${a}/inbox`}>Document inbox</Link>} />
        <Spine tail={context.reg} context="The whole life" href={`${a}/logbooks/map`} />
        <Leaves split="2fr 1fr">
          <Leaf label="Documents">
            <p className="mb-3 text-lede text-ink-2">Documents could not be loaded.</p>
            <Button variant="quiet" href={self}>Try again</Button>
          </Leaf>
          <SourceMat />
        </Leaves>
      </Board>
    );
  }

  const docs = docsRes.data ?? [];
  const today = due?.snap.today ?? new Date().toISOString().slice(0, 10);
  const latestWB = wbRes.data?.[0]?.revision_date ?? null;
  const changes: EquipChange[] = (partsRes.data ?? []).flatMap((c) => [
    ...(c.install_date ? [{ name: c.name, date: c.install_date, kind: "install" as const }] : []),
    ...(c.removal_date ? [{ name: c.name, date: c.removal_date, kind: "removal" as const }] : []),
  ]);
  const stale = latestWB != null && staleWBChanges(latestWB, changes).length > 0;
  const carry = carryAboard(docs, today, { hasRevision: latestWB != null, stale });
  const gap = docsGap(docs, carry);

  // Linked entries: the ones the documents point at (any trust) plus the confirmed ones offered in the Select.
  const linkedIds = [...new Set(docs.map((d) => d.log_entry_id).filter((x): x is string => !!x))];
  const { data: linkedRows } = linkedIds.length
    ? await supabase.from("log_entry").select("id, entry_date, description, work_performed").in("id", linkedIds)
    : { data: [] };
  const linked = new Map((linkedRows ?? []).map((e) => [e.id, e]));
  const entryLabel = (e: { entry_date: string | null; description: string | null; work_performed: string | null }) =>
    [e.entry_date ? fmtDate(e.entry_date) : "Undated", summary(e)].filter(Boolean).join(" · ");
  const entryOptions: EntryOption[] = (entriesRes.data ?? []).map((e) => ({ id: e.id, label: entryLabel(e) }));
  for (const e of linkedRows ?? []) if (!entryOptions.some((o) => o.id === e.id)) entryOptions.unshift({ id: e.id, label: entryLabel(e) });

  const expiryItems = new Map((due?.snap.items ?? []).filter((i) => i.source === "document").map((i) => [i.key.slice(4), i]));
  const tracked = docs.filter((d) => d.track_expiry);

  const q = sp.q?.trim() ?? "";
  const shown = docs.filter((d) => matchesQuery(d, q));
  const selected = docs.find((d) => d.id === sp.doc) ?? null;
  const panel = canEdit ? sp.panel : undefined;
  const sel = (docId: string) => `${self}?doc=${docId}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const actions = canEdit ? (
    <Button variant="on-board" href={`${self}?panel=new`}>
      Add a document
    </Button>
  ) : null;

  let right: React.ReactNode;
  if (panel === "new") {
    right = <DocForm key="new" aircraftId={id} entries={entryOptions} closeHref={self} />;
  } else if (panel === "edit" && selected) {
    right = <DocForm key={selected.id} aircraftId={id} doc={selected} entries={entryOptions} closeHref={sel(selected.id)} />;
  } else if (selected) {
    const isPdf = selected.mime_type === "application/pdf";
    const src = `/api/document/${selected.id}`;
    const entry = selected.log_entry_id ? linked.get(selected.log_entry_id) : undefined;
    const expiry = selected.track_expiry ? (selected.expires_on ? `expires ${fmtDate(selected.expires_on)}` : "expiry not dated") : "no expiry";
    right = (
      <SourceMat
        title={docTitle(selected)}
        meta={[`Added ${fmtDate(selected.created_at.slice(0, 10))}`, DOC_LABEL[selected.type], fmtSize(selected.size_bytes)].filter(Boolean).join(" · ")}
      >
        {isPdf ? (
          <iframe src={src} title={docTitle(selected)} className="min-h-[420px] w-full flex-1 rounded-[var(--radius-s)] bg-leaf" />
        ) : (
          <ScanViewer src={src} alt={docTitle(selected)} />
        )}
        <div className="flex flex-wrap gap-2">
          <a href={`${src}?download`} className={buttonClass("on-mat", "s")}>Download</a>
          <a href={src} target="_blank" rel="noreferrer" className={buttonClass("on-mat", "s")}>Open in a new tab</a>
        </div>
        <p className="text-[13px] leading-[1.45] text-on-cover-2">
          Category: {DOC_LABEL[selected.type]} · {expiry} ·{" "}
          {entry ? (
            <Link href={`${a}/logbooks/entries/${entry.id}`} className="text-on-cover underline decoration-dotted">
              {entryLabel(entry)}
            </Link>
          ) : (
            "not linked to a logbook entry"
          )}
          {selected.reference ? ` · ${selected.reference}` : ""}
        </p>
        {selected.notes && <p className="text-[13px] leading-[1.45] text-on-cover">{selected.notes}</p>}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Link href={`${sel(selected.id)}&panel=edit`} replace scroll={false} className={buttonClass("on-mat", "s")}>
              Edit details
            </Link>
            {entry && (
              <form action={unlinkDocument.bind(null, id, selected.id, selected.updated_at)}>
                <button type="submit" className={buttonClass("on-mat", "s")}>Unlink</button>
              </form>
            )}
            <form action={deleteDocument.bind(null, id, selected.id, selected.updated_at)}>
              <ConfirmSubmit
                label="Delete"
                variant="secondary"
                question={`Delete ${docTitle(selected)}? It is removed from Documents and from any entry it's attached to.`}
              />
            </form>
          </div>
        )}
      </SourceMat>
    );
  } else {
    right = (
      <SourceMat>
        <p className="m-auto text-[15px] text-on-cover-2">Select a document to see it here.</p>
      </SourceMat>
    );
  }

  return (
    <Board section="docs">
      <style>{PRINT_CSS}</style>
      <BoardHead title="Documents" actions={<><Link href={`${a}/inbox`}>Document inbox</Link>{actions}</>} />
      <Spine
        tail={context.reg}
        context={selected?.document_date ? `Dated ${fmtDate(selected.document_date)}` : "The whole life"}
        href={`${a}/logbooks/map`}
        model={due ? buildMapModel(due.loaded.input, due.loaded.today) : null}
        window={selected?.document_date ? { from: selected.document_date, to: selected.document_date } : null}
        statusHref={`${a}/status`}
      />
      <Leaves split="2fr 1fr">
        <Leaf label="Documents">
          {sp.done && DONE[sp.done] && (
            <div className="mb-4">
              <Notice>{DONE[sp.done]}</Notice>
            </div>
          )}
          {sp.done === "failed" && (
            <div className="mb-4">
              <Notice tone="alarm">That didn&apos;t save. Try again.</Notice>
            </div>
          )}
          <p className="mb-5 max-w-[46ch] text-lede">
            {docs.length === 0
              ? "No documents yet. Add the airworthiness certificate and registration first; they're two of the four papers you carry aboard."
              : `${plural(docs.length, "document")}.${gap ? ` ${gap}` : ""}`}
          </p>

          <div id="carry-aboard">
            <HungSection title="Carry aboard" count="the AROW papers" first>
              <ul className="divide-y divide-rule">
                {carry.map((r) => (
                  <li key={r.key} className="flex min-h-11 items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 text-body-strong">
                      {r.docId ? (
                        <Link href={sel(r.docId)} replace scroll={false} className="hover:underline">
                          {r.label}
                        </Link>
                      ) : (
                        r.label
                      )}
                    </span>
                    {r.href ? (
                      <Link href={`${a}/${r.href}`} className="underline decoration-dotted underline-offset-[3px]">
                        <StatusMark kind={r.kind} label={r.state} />
                      </Link>
                    ) : (
                      <StatusMark kind={r.kind} label={r.state} />
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <PrintButton />
              </div>
            </HungSection>
          </div>

          {tracked.length > 0 && (
            <HungSection title="Expiries" count="also on the due list">
              <ul className="divide-y divide-rule">
                {tracked.map((d) => {
                  const item = expiryItems.get(d.id);
                  return (
                    <li key={d.id} className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 py-2">
                      <Link href={sel(d.id)} replace scroll={false} className="min-w-0 flex-1 text-body-strong hover:underline">
                        {docTitle(d)}
                      </Link>
                      {d.expires_on ? (
                        <>
                          <span className="text-small text-ink-2 tabular-nums">{fmtDate(d.expires_on)}</span>
                          {item && <span className="text-small font-bold tabular-nums">{leftText(item)}</span>}
                          {item && <StatusMark kind={item.status} />}
                        </>
                      ) : (
                        <>
                          <StatusMark kind="no_record" label="No date on file" />
                          {canEdit && (
                            <Link href={`${sel(d.id)}&panel=edit`} replace scroll={false} className={buttonClass("secondary", "s")}>
                              Add the date
                            </Link>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </HungSection>
          )}

          {docs.length > 0 && (
            <HungSection title="Everything" count={q ? `${shown.length} of ${docs.length}` : plural(docs.length, "document")}>
              <form action={self} className="mb-3 flex gap-2" role="search">
                <label className="sr-only" htmlFor="doc-search">Search documents</label>
                <input id="doc-search" name="q" type="search" defaultValue={q} placeholder="Search titles, numbers and notes" className={`${fieldClass} mt-0`} />
                <button type="submit" className={buttonClass("secondary", "m")}>Search</button>
              </form>
              {shown.length === 0 ? (
                <p className="text-body text-ink-2">No documents match “{q}”.</p>
              ) : (
                <table className="w-full text-left text-small">
                  <thead className="text-label text-ink-3">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-semibold">Category</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Document</th>
                      <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
                      <th scope="col" className="py-2 font-semibold">Linked to</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {DOCUMENT_TYPES.flatMap((t) =>
                      shown
                        .filter((d) => d.type === t)
                        .map((d) => {
                          const entry = d.log_entry_id ? linked.get(d.log_entry_id) : undefined;
                          const isSel = d.id === selected?.id;
                          return (
                            <tr key={d.id} aria-current={isSel ? "true" : undefined} className={isSel ? "bg-leaf-2" : ""}>
                              <td className="py-2.5 pr-3 text-ink-2">{DOC_LABEL[t]}</td>
                              <td className="py-2.5 pr-3">
                                <Link href={sel(d.id)} replace scroll={false} className="text-body-strong hover:underline">
                                  {docTitle(d)}
                                </Link>
                                {d.reference && <span className="block text-caption text-ink-3">{d.reference}</span>}
                              </td>
                              <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums text-ink-2">{d.document_date ? fmtDate(d.document_date) : ""}</td>
                              <td className="py-2.5 text-ink-2">
                                {entry && (
                                  <Link href={`${a}/logbooks/entries/${entry.id}`} className="text-caption text-board-ink underline decoration-dotted underline-offset-[3px]">
                                    {entryLabel(entry)}
                                  </Link>
                                )}
                              </td>
                            </tr>
                          );
                        }),
                    )}
                  </tbody>
                </table>
              )}
            </HungSection>
          )}
          {!canEdit && <p className="mt-4 text-small text-ink-3">You can view this aircraft&apos;s documents. Ask the owner to make you an editor to add or change them.</p>}
        </Leaf>
        {right}
      </Leaves>
    </Board>
  );
}

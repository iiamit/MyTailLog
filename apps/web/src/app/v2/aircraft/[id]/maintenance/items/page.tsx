import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { fmtDate } from "@/lib/due/engine";
import { aircraftTail } from "@/lib/v2/landing";
import { maintTabs } from "@/lib/v2/tabs";
import { BOOK, fmtMeter } from "@/lib/v2/status";
import { countedOn, everyText, remindText, shopKindWord } from "@/lib/v2/items";
import { providerProposals, type ProposalEntry } from "@/lib/writes/providers";
import { Board, BoardHead, HungSection, Leaf, Leaves, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Notice } from "@/ui/Form";
import { ItemMat } from "@/ui/StatusSpread";
import { addProposal, removeProvider, seedStandard } from "./actions";
import { FindCompletions, ItemForm, ProposalRow, ProviderForm } from "./ItemsClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Tracked items · ${await aircraftTail(id)}` };
}

type Search = { item?: string; panel?: string; provider?: string; saved?: string; seeded?: string; stopped?: string; providerSaved?: string; providerRemoved?: string; error?: string };

const th = "border-b border-rule-2 pr-3 pb-2 text-left text-label font-bold text-ink-3";
const td = "border-b border-rule py-2.5 pr-3 align-top";
const link = "font-semibold text-board-ink underline decoration-dotted";

/** W-MAINT-06 Tracked items: the rule book (interval, meter, kind, reminder), seeding, and shops and mechanics. */
export default async function ItemsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/maintenance/items`;

  const [items, ads, docs, provs, squawks, due] = await Promise.all([
    supabase.from("maintenance_item").select("*").eq("aircraft_id", id).order("label"),
    supabase.from("ad_compliance").select("id, reference, kind, title, interval_hours, interval_months").eq("aircraft_id", id).eq("recurring", true).not("status", "in", "(not_applicable,superseded)"),
    supabase.from("document").select("id, title, type, expires_on, track_expiry").eq("aircraft_id", id).eq("track_expiry", true),
    supabase.from("service_provider").select("*").eq("aircraft_id", id).order("name"),
    supabase.from("squawk").select("id", { count: "exact", head: true }).eq("aircraft_id", id).eq("status", "open"),
    dueSnapshot(id, auth.user.id).catch(() => null),
  ]);
  const providers = provs.data ?? [];

  // Proposals (09 §2.4): signers on two or more confirmed entries who aren't a shop yet. Editors only.
  let proposals: ReturnType<typeof providerProposals> = [];
  if (context.canEdit) {
    const { data: signed } = await supabase.from("log_entry")
      .select("signature_name, mechanic_cert_number, entry_date, trust, replaced_by_entry_id")
      .eq("aircraft_id", id).not("signature_name", "is", null).limit(5000);
    proposals = providerProposals((signed ?? []) as ProposalEntry[], providers).slice(0, 5);
  }

  const dueByKey = new Map((due?.snap.items ?? []).map((i) => [i.key, i]));
  const rows = items.data ?? [];
  const selected = rows.find((r) => r.id === sp.item) ?? null;
  const editing = context.canEdit && (sp.panel === "new" || (sp.panel === "edit" && selected));
  const provider = sp.provider === "new" ? null : providers.find((p) => p.id === sp.provider) ?? null;
  const providerOpen = context.canEdit && (sp.provider === "new" || !!provider);

  const head = (
    <>
      <BoardHead
        title="Maintenance"
        subTabs={maintTabs(id, "items", { squawks: squawks.count })}
        actions={context.canEdit && <Button variant="on-board" href={`${self}?panel=new`}>Track an item</Button>}
      />
      <Spine tail={context.reg} context="The whole life" href={`${a}/logbooks/map`} />
    </>
  );

  if (items.error) {
    return (
      <Board section="maint">
        {head}
        <Leaves split="1.6fr 1fr">
          <Leaf label="Tracked items">
            <p className="mb-3 text-lede text-ink-2">Tracked items could not be loaded.</p>
            <Button variant="quiet" href={self}>Try again</Button>
          </Leaf>
          <Leaf label="Item"><span /></Leaf>
        </Leaves>
      </Board>
    );
  }

  const notice =
    sp.error ? <Notice tone="alarm">{sp.error}</Notice>
    : sp.saved ? <Notice>Item saved.</Notice>
    : sp.seeded ? <Notice>Added the standard Part 91 items.</Notice>
    : sp.stopped ? <Notice>Stopped tracking. Its history stays in the logbooks.</Notice>
    : sp.providerSaved ? <Notice>Shop saved.</Notice>
    : sp.providerRemoved ? <Notice>Removed. Items that used it fall back to the default for their kind.</Notice>
    : null;

  const right = editing ? (
    <ItemForm
      key={sp.panel === "edit" ? selected?.id : "new"}
      aircraftId={id}
      item={sp.panel === "edit" ? selected : null}
      providers={providers}
      closeHref={selected ? `${self}?item=${selected.id}` : self}
      askHref={`${a}/ask?q=${encodeURIComponent(`When was the ${selected?.label ?? "item"} last done?`)}`}
    />
  ) : providerOpen ? (
    <ProviderForm key={provider?.id ?? "new"} aircraftId={id} provider={provider} closeHref={self} />
  ) : (
    <ItemMat item={selected ? dueByKey.get(`mx:${selected.id}`) ?? null : null} aircraftId={id} />
  );

  return (
    <Board section="maint">
      {head}
      <Leaves split="1.6fr 1fr">
        <Leaf label="Tracked items">
          {notice && <div className="mb-4">{notice}</div>}
          <p className="mb-4 text-lede">
            The rules MyTailLog counts by. What is due is on Status.{" "}
            <Link href={`${a}/status`} className={link}>What&apos;s due</Link>
          </p>

          {rows.length === 0 ? (
            <div className="border-t-2 border-ink pt-4">
              <p className="mb-3 text-body text-ink-2">Nothing is tracked yet.</p>
              {context.canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <form action={seedStandard.bind(null, id)}>
                    <button type="submit" className={buttonClass("primary", "m")}>Add the standard Part 91 items</button>
                  </form>
                  <Button href={`${self}?panel=new`}>Track an item</Button>
                </div>
              ) : (
                <p className="text-body text-ink-2">You can view this aircraft. Ask the owner to make you an editor to track items.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-body">
                <thead>
                  <tr>
                    <th scope="col" className={th}>Item</th>
                    <th scope="col" className={th}>Every</th>
                    <th scope="col" className={th}>Counted on</th>
                    <th scope="col" className={th}>Kind</th>
                    <th scope="col" className={th}>Last done</th>
                    <th scope="col" className={th}>Remind</th>
                    <th scope="col" className={th}><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = dueByKey.get(`mx:${r.id}`);
                    const lineName = BOOK[r.line ?? d?.line ?? "airframe"];
                    const on = r.id === selected?.id;
                    return (
                      <tr key={r.id} aria-current={on ? "true" : undefined} className={on ? "bg-leaf-2" : undefined}>
                        <td className={td}>
                          <Link href={`${self}?item=${r.id}`} replace scroll={false} className="text-body-strong hover:underline">{r.label}</Link>
                          <span className="block text-small text-ink-3">
                            {lineName}
                            {r.ifr_only ? " · IFR only" : ""}
                            {shopKindWord(r.shop_kind) ? ` · ${shopKindWord(r.shop_kind)}` : ""}
                            {r.provider_id ? ` · ${providers.find((p) => p.id === r.provider_id)?.name ?? ""}` : ""}
                          </span>
                        </td>
                        <td className={td}>{everyText(r)}</td>
                        <td className={td}>{countedOn(r)}</td>
                        <td className={td}>{r.regulatory ? "Required" : "Advisory"}</td>
                        <td className={td}>
                          {r.last_done_date || r.last_done_hours != null ? (
                            <>
                              {[r.last_done_date && fmtDate(r.last_done_date), r.last_done_hours != null && `at ${fmtMeter(r.last_done_hours)}`].filter(Boolean).join(" ")}
                              <span className="block text-small">
                                {d?.lastDone?.pageId && d.lastDone.pageLabel ? (
                                  <Link href={`${self}?item=${r.id}`} replace scroll={false} className="text-caption text-board-ink underline decoration-dotted">{d.lastDone.pageLabel}</Link>
                                ) : (
                                  <span className="text-caption text-ink-3">you typed it</span>
                                )}
                              </span>
                            </>
                          ) : (
                            <span className="text-ink-3">not on record</span>
                          )}
                        </td>
                        <td className={td}>{remindText(r.remind_lead_days, r.remind_lead_hours)}</td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          {context.canEdit && (
                            <Link href={`${self}?item=${r.id}&panel=edit`} replace scroll={false} className={buttonClass("quiet", "s")}>Edit</Link>
                          )}
                          <Link href={`${a}/status/item/mx:${r.id}`} className={buttonClass("quiet", "s")}>Open its history</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(ads.data ?? []).length > 0 && (
            <HungSection title="Recurring ADs" count={`${ads.data!.length}`}>
              <ul className="divide-y divide-rule">
                {ads.data!.map((ad) => (
                  <li key={ad.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>
                      <span className="text-body-strong">{ad.kind === "sb" ? "SB" : "AD"} {ad.reference}</span>
                      {ad.title ? <span className="text-ink-2"> {ad.title}</span> : null}
                      <span className="block text-small text-ink-3">every {everyText({ kind: "ad", interval_hours: ad.interval_hours, interval_months: ad.interval_months, expires_on: null })}</span>
                    </span>
                    <Link href={`${a}/maintenance/ads?ad=${ad.id}`} className={`text-small ${link}`}>Edit in ADs and SBs</Link>
                  </li>
                ))}
              </ul>
            </HungSection>
          )}

          {(docs.data ?? []).length > 0 && (
            <HungSection title="Papers with an expiry" count={`${docs.data!.length}`}>
              <ul className="divide-y divide-rule">
                {docs.data!.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>
                      <span className="text-body-strong">{doc.title ?? doc.type}</span>
                      <span className="block text-small text-ink-3">{doc.expires_on ? `expires ${fmtDate(doc.expires_on)}` : "no expiry date on file"}</span>
                    </span>
                    <Link href={`${a}/documents?doc=${doc.id}`} className={`text-small ${link}`}>Edit in Documents</Link>
                  </li>
                ))}
              </ul>
            </HungSection>
          )}

          {context.canEdit && rows.length > 0 && (
            <HungSection title="From the logs">
              <FindCompletions aircraftId={id} />
            </HungSection>
          )}

          <HungSection title="Shops and mechanics" count={`${providers.length}`}>
            {providers.length === 0 && <p className="mb-2 text-body text-ink-2">No shops or mechanics yet. Add the people who work on {context.reg}.</p>}
            <ul className="divide-y divide-rule">
              {providers.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className="text-body-strong">{p.name}</span>
                    {p.is_default && (
                      <span className="ml-2 rounded-[var(--radius-s)] border border-ink px-1 text-label">Default for {shopKindWord(p.kind)?.toLowerCase()}</span>
                    )}
                    <span className="block text-small text-ink-3">
                      {[shopKindWord(p.kind), p.cert_number && `cert ${p.cert_number}`, p.airport, p.email, p.phone].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {context.canEdit && (
                    <span className="flex gap-1">
                      <Link href={`${self}?provider=${p.id}`} replace scroll={false} className={buttonClass("quiet", "s")}>Edit</Link>
                      <form action={removeProvider.bind(null, id, p.id, p.updated_at)}>
                        <ConfirmSubmit label="Remove" question={`Remove ${p.name}? Items that use it fall back to the default for their kind.`} />
                      </form>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {proposals.length > 0 && (
              <ul className="mt-2 divide-y divide-rule border-t border-rule">
                {proposals.map((pr) => (
                  <ProposalRow key={`${pr.name}|${pr.certNumber}`}>
                    <span className="min-w-0 flex-1 text-body">
                      Found in the logs: <span className="font-semibold">{pr.name}</span>
                      {pr.certNumber ? `, ${pr.certNumber}` : ""}, signed {pr.entries} confirmed entries.
                    </span>
                    <form action={addProposal.bind(null, id, pr.name, pr.certNumber)}>
                      <button type="submit" className={buttonClass("secondary", "s")}>Add</button>
                    </form>
                  </ProposalRow>
                ))}
              </ul>
            )}
            {context.canEdit && (
              <Link href={`${self}?provider=new`} replace scroll={false} className={`mt-3 ${buttonClass("secondary", "s")}`}>
                Add a shop or mechanic
              </Link>
            )}
          </HungSection>
        </Leaf>
        {right}
      </Leaves>
    </Board>
  );
}

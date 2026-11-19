import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { decryptSecret } from "@/lib/crypto";
import { addDays, daysBetween, fmtDate } from "@/lib/due/engine";
import { dueSnapshot } from "@/lib/due/load";
import { documentTypeLabel } from "@/lib/documents";
import { buildMapModel } from "@/lib/mapModel";
import { roomActive, roomOpens, roomUrl, ROOM_LIST_COLS, type Room } from "@/lib/recordRoom";
import { aircraftTail } from "@/lib/v2/landing";
import { BOOK } from "@/lib/v2/status";
import { monD } from "@/lib/v2/visits";
import { Board, BoardHead, HungSection, Leaf, Leaves, Spine } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { ConfirmSubmit, FormLeaf, Notice, fieldClass } from "@/ui/Form";
import { Qr } from "@/ui/Qr";
import { changeRoom, invite, removePerson, removeRoom, setRole } from "./actions";
import { CopyLink, CreateRoomForm, type Audience, type Choice } from "./ShareForms";
import { shareTabs } from "./tabs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Share · ${await aircraftTail(id)}` };
}

const AUDIENCE: Record<Exclude<Audience, "other">, string> = { ia: "Your IA, for the annual", buyer: "A buyer", insurer: "An insurer" };
const WINDOW_WORD: Record<Room["map_window"], string> = { line_ahead: "the line ahead to the annual", whole_life: "the whole-life map", last_5_years: "the last five years" };
const SECTION_WORD = (s: string, books: Map<string, string>) =>
  s === "map" ? "the map" : s === "summary" ? "summary" : s === "dossier" ? "pre-buy dossier" : s === "documents" ? "Documents" : s.startsWith("logbook:") ? `${books.get(s.slice(8)) ?? "a"} logbook` : s;
const time = (iso: string, tz: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });

/** W-SHARE-01 Share hub: who it's for, the record room links, the people with an account; the selected link on the right. */
export default async function ShareHub({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ room?: string; audience?: string; made?: string; note?: string; err?: string; pnote?: string; perr?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  if (!context.isOwner) redirect(`${a}/share/dossier`);

  const [{ data: rooms }, { data: books }, { data: docs }, { data: shares }, { data: profile }, due] = await Promise.all([
    supabase.from("record_room").select(ROOM_LIST_COLS).eq("aircraft_id", id).order("created_at", { ascending: false }),
    supabase.from("logbook").select("id, type, title").eq("aircraft_id", id).order("created_at"),
    supabase.from("document").select("id, type, title, file_name, document_date").eq("aircraft_id", id).not("storage_path", "is", null).order("created_at"),
    supabase.from("aircraft_share").select("id, invited_email, role").eq("aircraft_id", id).order("created_at"),
    supabase.from("profile").select("full_name, time_zone").eq("id", auth.user.id).maybeSingle(),
    dueSnapshot(id, auth.user.id).catch(() => null),
  ]);
  const roomIds = (rooms ?? []).map((r) => r.id);
  const [{ data: views }, confirmed] = await Promise.all([
    roomIds.length
      ? supabase.from("record_room_view").select("room_id, session_key, section, created_at").in("room_id", roomIds).limit(5000)
      : Promise.resolve({ data: [] as { room_id: string; session_key: string | null; section: string | null; created_at: string }[] }),
    Promise.all((books ?? []).map(async (b) => {
      const { count } = await supabase.from("log_entry").select("id", { count: "exact", head: true })
        .eq("logbook_id", b.id).in("trust", ["confirmed", "signed"]).is("replaced_by_entry_id", null).is("authored_superseded_by", null);
      return [b.id, count ?? 0] as const;
    })),
  ]);
  const confirmedBy = new Map(confirmed);
  const bookName = new Map((books ?? []).map((b) => [b.id, b.title || BOOK[b.type] || b.type]));
  const owner = profile?.full_name || auth.user.email || "the owner";
  const today = due?.loaded.today ?? new Date().toISOString().slice(0, 10);
  const annualDue = due?.snap.items.find((i) => i.kind === "annual")?.calendar?.dueDate ?? null;

  const list = (rooms ?? []).map((r) => {
    const opens = roomOpens((views ?? []).filter((v) => v.room_id === r.id));
    return { r: r as Room & { token_enc: string }, active: roomActive(r), opens };
  });
  const live = list.filter((x) => x.active).length;
  const audience = (["ia", "buyer", "insurer", "other"] as const).find((x) => x === sp.audience);
  const selected = audience ? null : (list.find((x) => x.r.id === sp.room) ?? list.find((x) => x.active) ?? null);

  const contents = (r: Room) => {
    const parts = [
      [r.include_summary && "Summary", r.include_dossier && "Dossier"].filter(Boolean).join(" and ") || null,
      r.logbook_ids.length ? `${r.logbook_ids.length} ${r.logbook_ids.length === 1 ? "logbook" : "logbooks"}` : null,
      r.document_ids.length ? `${r.document_ids.length} ${r.document_ids.length === 1 ? "document" : "documents"}` : null,
      r.logbook_ids.length ? (r.include_scans ? "with scans" : "no scans") : null,
    ];
    return parts.filter(Boolean).join(", ");
  };
  const until = (x: (typeof list)[number]) =>
    x.r.revoked_at
      ? ["Revoked by you", fmtDate(x.r.revoked_at.slice(0, 10))]
      : !x.active
        ? ["Expired", fmtDate(x.r.expires_at.slice(0, 10))]
        : [monD(x.r.expires_at.slice(0, 10)), `${Math.max(0, daysBetween(today, x.r.expires_at.slice(0, 10)))} days left`];

  const nBooks = (books ?? []).length;
  const presets: { key: Audience | "people"; title: string; line: string }[] = [
    { key: "ia", title: AUDIENCE.ia, line: `Annual checklist, summary, all ${nBooks} logbooks with scans · opens on the line ahead to the annual · open until the annual` },
    { key: "buyer", title: AUDIENCE.buyer, line: "Pre-buy dossier, confirmed entries, documents · opens on the whole-life map · 30 days" },
    { key: "insurer", title: AUDIENCE.insurer, line: "Maintenance summary, registration, airworthiness and W&B · opens on the last five years · 14 days" },
    { key: "people", title: "A co-owner or your mechanic", line: "An invitation to an account that can view or edit, instead of a link" },
  ];

  const bookChoices: Choice[] = (books ?? []).map((b) => ({ id: b.id, label: bookName.get(b.id)!, detail: `${confirmedBy.get(b.id) ?? 0} confirmed`, preset: [] }));
  const INSURER_DOCS = new Set(["registration", "airworthiness_cert", "weight_balance"]);
  const docChoices: Choice[] = (docs ?? []).map((d) => ({
    id: d.id,
    label: d.title || d.file_name || documentTypeLabel(d.type),
    detail: d.document_date ? fmtDate(d.document_date) : undefined,
    preset: INSURER_DOCS.has(d.type) ? ["buyer", "insurer"] : ["buyer"],
  }));

  const right = audience ? (
    <FormLeaf title={audience === "other" ? "Make a link" : `Make a link for ${AUDIENCE[audience].toLowerCase().replace(/^your ia/, "your IA")}`} closeHref={`${a}/share`}>
      <CreateRoomForm
        aircraftId={id}
        audience={audience}
        books={bookChoices}
        documents={docChoices}
        today={today}
        annualEnds={annualDue && annualDue > today ? `Until 14 days after the annual (${fmtDate(addDays(annualDue, 14))})` : null}
      />
    </FormLeaf>
  ) : selected ? (
    <RoomPanel
      x={selected}
      aircraftId={id}
      owner={owner}
      bookName={bookName}
      docCount={(docs ?? []).length}
      nBooks={nBooks}
      made={sp.made === "1"}
      tz={profile?.time_zone || "America/New_York"}
      note={sp.note}
      err={sp.err}
    />
  ) : (
    <Leaf label="Record room link">
      <p className="text-body text-ink-2">No links yet. Pick who it&apos;s for to make one.</p>
    </Leaf>
  );

  return (
    <Board section="share">
      <BoardHead title="Share" subTabs={shareTabs(id, "links", true)} />
      <Spine
        tail={context.reg}
        context="whole record"
        href={`${a}/logbooks/map`}
        model={due ? buildMapModel(due.loaded.input, due.loaded.today) : null}
        statusHref={`${a}/status`}
      />
      <Leaves split="1.5fr 1fr">
        <Leaf label="Links and people">
          <h2 className="mb-3 text-heading">Who is it for?</h2>
          <ul className="grid gap-2">
            {presets.map((p) => {
              const on = audience === p.key;
              return (
                <li key={p.key}>
                  <Link
                    href={p.key === "people" ? `${a}/share#invite-email` : `${a}/share?audience=${p.key}`}
                    aria-current={on ? "true" : undefined}
                    className={`state-layer flex items-center gap-3 rounded-control border px-4 py-3 ${on ? "border-ink bg-leaf-2" : "border-rule"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-strong">{p.title}</span>
                      <span className="block text-small text-ink-3">{p.line}</span>
                    </span>
                    <ChevronRight aria-hidden size={18} className="shrink-0 text-ink-3" />
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="mt-6">
            <HungSection title="Record room links" count={`${live} live`} first>
              {list.length ? (
                <table className="w-full text-left text-small">
                  <thead className="text-caption text-ink-3">
                    <tr><th className="pb-1 font-semibold">For</th><th className="pb-1 font-semibold">Open until</th><th className="pb-1 text-right font-semibold">Opens</th></tr>
                  </thead>
                  <tbody>
                    {list.map((x) => {
                      const [u1, u2] = until(x);
                      const sel = selected?.r.id === x.r.id;
                      const href = `${a}/share?room=${x.r.id}`;
                      return (
                        <tr key={x.r.id} className={`border-t border-rule align-top ${x.active ? "" : "text-ink-3"} ${sel ? "bg-highlight" : ""}`}>
                          <td className="py-2 pr-3">
                            <Link href={href} replace scroll={false} aria-current={sel ? "true" : undefined} className="text-body-strong underline-offset-2 hover:underline">
                              {x.r.label}
                            </Link>
                            <span className="block text-ink-3">{contents(x.r)}{x.active ? "" : " · Ended"}</span>
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">{u1}<span className="block text-ink-3">{u2}</span></td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {x.opens.length}
                            <span className="block text-ink-3">{x.opens[0] ? `last ${monD(x.opens[0].lastAt.slice(0, 10))}` : "not opened"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-body text-ink-2">No links yet. Pick who it&apos;s for to make one.</p>
              )}
            </HungSection>

            <div id="people" className="scroll-mt-4">
              <HungSection title="People with an account" count={shares?.length ? `${shares.length + 1}` : undefined}>
                {sp.pnote && <div className="mb-3"><Notice>{sp.pnote}</Notice></div>}
                {sp.perr && <div className="mb-3"><Notice tone="alarm">{sp.perr}</Notice></div>}
                <ul>
                  <li className="flex items-center gap-3 py-2">
                    <Initials name={owner} />
                    <span className="min-w-0 flex-1 truncate text-body">{owner}</span>
                    <span className="text-small text-ink-3">Owner</span>
                  </li>
                  {(shares ?? []).map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 border-t border-rule py-2">
                      <Initials name={s.invited_email} />
                      <span className="min-w-0 flex-1 truncate text-body">{s.invited_email}</span>
                      <div role="group" aria-label={`Access for ${s.invited_email}`} className="inline-flex rounded-control border border-control-border p-0.5">
                        {(["editor", "viewer"] as const).map((role) => (
                          <form key={role} action={setRole.bind(null, id, s.invited_email, role)}>
                            <button
                              type="submit"
                              aria-pressed={s.role === role}
                              disabled={s.role === role}
                              className={`rounded-[var(--radius-s)] px-2.5 py-1 text-small font-semibold ${s.role === role ? "bg-ink text-leaf disabled:opacity-100" : "text-ink-2"}`}
                            >
                              {role === "editor" ? "Can edit" : "Can view"}
                            </button>
                          </form>
                        ))}
                      </div>
                      <form action={removePerson.bind(null, id, s.invited_email)}>
                        <ConfirmSubmit label="Remove" question={`Remove ${s.invited_email}'s access to ${context.reg}?`} confirmLabel="Remove access" />
                      </form>
                    </li>
                  ))}
                </ul>
                {!shares?.length && <p className="mb-2 text-small text-ink-3">Not shared with anyone yet.</p>}
                <form action={invite.bind(null, id)} className="mt-3 flex flex-wrap items-end gap-2 border-t border-rule pt-3">
                  <label className="block min-w-[200px] flex-1 text-label">
                    Email
                    <input id="invite-email" name="email" type="email" required autoComplete="off" className={fieldClass} />
                  </label>
                  <fieldset className="inline-flex h-[42px] items-center rounded-control border border-control-border p-0.5">
                    <legend className="sr-only">Access</legend>
                    {(["viewer", "editor"] as const).map((role) => (
                      <label key={role} className="cursor-pointer rounded-[var(--radius-s)] px-2.5 py-1.5 text-small font-semibold text-ink-2 has-checked:bg-ink has-checked:text-leaf">
                        <input type="radio" name="role" value={role} defaultChecked={role === "viewer"} className="sr-only" />
                        {role === "editor" ? "Can edit" : "Can view"}
                      </label>
                    ))}
                  </fieldset>
                  <button type="submit" className={buttonClass("secondary")}>Invite</button>
                  <p className="w-full text-small text-ink-3">We email them an invitation. They get access when they sign in with this email.</p>
                </form>
              </HungSection>
            </div>
          </div>
        </Leaf>
        {right}
      </Leaves>
    </Board>
  );
}

function Initials({ name }: { name: string }) {
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  const text = ((parts[0]?.[0] ?? "") + (parts.length > 1 && !name.includes("@") ? parts[parts.length - 1][0] : "")).toUpperCase();
  return <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-leaf-2 text-caption font-bold text-ink-2">{text}</span>;
}

/** The selected link (W-SHARE-01 right leaf): cover, link and QR, contents, end, opens and revoke. */
function RoomPanel({
  x,
  aircraftId,
  owner,
  bookName,
  docCount,
  nBooks,
  made,
  tz,
  note,
  err,
}: {
  x: { r: Room & { token_enc: string }; active: boolean; opens: ReturnType<typeof roomOpens> };
  aircraftId: string;
  owner: string;
  bookName: Map<string, string>;
  docCount: number;
  nBooks: number;
  made: boolean;
  tz: string;
  note?: string;
  err?: string;
}) {
  const r = x.r;
  const token = decryptSecret(r.token_enc);
  const url = token ? roomUrl(token) : null;
  const shortUrl = url ? `${url.replace(/^https?:\/\//, "").replace(/\/r\/(.{6}).*$/, "/r/$1…")}` : null;
  const tabs = [r.logbook_ids.length && "the map", r.include_summary && "Summary", r.include_dossier && "the dossier", r.logbook_ids.length && "Logbooks", r.document_ids.length && "Documents"].filter(Boolean) as string[];
  const NOTE: Record<string, string> = { extended: "Extended 30 days.", revoked: "Link revoked. It no longer opens.", renamed: "Renamed." };
  return (
    <Leaf label={`Link for ${r.label}`}>
      {made && <div className="mb-4"><Notice>Link made. Copy it and send it yourself.</Notice></div>}
      {note && NOTE[note] && <div className="mb-4"><Notice>{NOTE[note]}</Notice></div>}
      {err && <div className="mb-4"><Notice tone="alarm">{err}</Notice></div>}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-heading">{r.label}</h2>
        <span className="text-small text-ink-3">Made {fmtDate(r.created_at.slice(0, 10))}</span>
      </div>
      <p className="mt-1 text-small text-ink-2">
        Shared by {owner} for {r.label}. Opens on {tabs[0] === "the map" ? WINDOW_WORD[r.map_window] : tabs[0] ?? "nothing"}
        {tabs.length > 1 ? `, then ${tabs.slice(1).join(", ")}` : ""}.
      </p>

      {x.active && (
        <section aria-label="Link" className="mt-4 flex gap-4 rounded-[var(--radius-s)] bg-leaf-2 p-3">
          {url ? <Qr value={url} size={120} label={`QR code for the link for ${r.label}`} /> : null}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            {url ? (
              <>
                <code className="w-full truncate text-caption">{shortUrl}</code>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyLink url={url} />
                </div>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-small font-semibold text-board-ink underline decoration-dotted">
                  See it as {r.label}
                </a>
              </>
            ) : (
              <p className="text-small text-ink-2">This link was made before links could be copied again. Make a new one to copy it.</p>
            )}
            <p className="text-small text-ink-3">MyTailLog doesn&apos;t send the link. Paste it into your own email or text.</p>
          </div>
        </section>
      )}

      <HungSection title="Shows" first>
        <ul className="space-y-0.5 text-body">
          {r.include_summary && <li>Maintenance summary</li>}
          {r.include_dossier && <li>Pre-buy dossier</li>}
          {r.logbook_ids.length > 0 && (
            <li>
              {r.logbook_ids.length === nBooks ? `All ${nBooks} logbooks` : r.logbook_ids.map((b) => bookName.get(b) ?? "Logbook").join(", ")}, confirmed entries only
            </li>
          )}
          {r.logbook_ids.length > 0 && <li>{r.include_scans ? "With page scans" : "No page scans"}</li>}
          {r.document_ids.length > 0 && <li>{r.document_ids.length} of {docCount} documents</li>}
          {r.include_squawks && <li>Open squawks, {r.include_reporters ? "with who reported them" : "reporters not named"}</li>}
        </ul>
        <p className="mt-2 text-small text-ink-3">To change what it shows, make a new link and revoke this one.</p>
        <form action={changeRoom.bind(null, aircraftId, r.id, "rename")} className="mt-2 flex items-end gap-2">
          <label className="block flex-1 text-label">
            Name
            <input name="label" defaultValue={r.label} required maxLength={80} className={fieldClass} />
          </label>
          <button type="submit" className={buttonClass("secondary")}>Rename</button>
        </form>
      </HungSection>

      <HungSection title="Ends">
        <p className="text-body">
          {r.revoked_at ? `Revoked ${fmtDate(r.revoked_at.slice(0, 10))}` : `${x.active ? "Ends" : "Ended"} ${fmtDate(r.expires_at.slice(0, 10))}`}
        </p>
        {x.active && (
          <form action={changeRoom.bind(null, aircraftId, r.id, "extend")} className="mt-2">
            <button type="submit" className={buttonClass("secondary", "s")}>Extend 30 days</button>
          </form>
        )}
      </HungSection>

      <HungSection title="Opened" count={`${x.opens.length} ${x.opens.length === 1 ? "time" : "times"}`}>
        {x.opens.length ? (
          <ul className="space-y-1 text-small">
            {x.opens.slice(0, 20).map((o) => (
              <li key={o.openedAt}>
                {time(o.openedAt, tz)}{o.sections.length ? ` · ${o.sections.map((s) => SECTION_WORD(s, bookName)).join(", ")}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-small text-ink-3">Not opened yet. Your own previews are not counted.</p>
        )}
      </HungSection>

      <div className="mt-4 border-t border-rule pt-4">
        {x.active ? (
          <form action={changeRoom.bind(null, aircraftId, r.id, "revoke")}>
            <ConfirmSubmit label="Revoke this link" question={`Revoke this link? ${r.label} won't be able to open it again.`} confirmLabel="Revoke link" variant="alarm" />
          </form>
        ) : (
          <form action={removeRoom.bind(null, aircraftId, r.id)}>
            <ConfirmSubmit label="Delete this link" question={`Delete the link for ${r.label}? Its opens are deleted with it.`} confirmLabel="Delete link" />
          </form>
        )}
      </div>
    </Leaf>
  );
}

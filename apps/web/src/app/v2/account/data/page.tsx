import type { Metadata } from "next";
import Link from "next/link";
import { loadSettings } from "@/app/profile/loadSettings";
import { Board, BoardHead, HungSection, Leaf, Leaves } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { HangarShell, loadHangarUser } from "@/ui/HangarShell";
import { AircraftSelect, AutoBackups, BackupDownload } from "./DataClient";

export const metadata: Metadata = { title: "Import and export" };

const CSV: [string, string][] = [
  ["entries", "Entries"],
  ["ad", "ADs and SBs"],
  ["equipment", "Equipment"],
  ["due", "Due list"],
];

/**
 * W-ACCOUNT-01 Import and export, backups: one screen for bringing records in and taking them out.
 * shortcut: the CSV wizard is still today's page (/aircraft/[id]/import); this screen opens it. Rebuild its three
 * steps here as a v2 Stepper, then redirect /import too (03 §10.2).
 */
export default async function DataPage({ searchParams }: { searchParams: Promise<{ aircraft?: string }> }) {
  const { supabase, user, profile, fleet } = await loadHangarUser("/account/data");
  const { aircraft: wanted } = await searchParams;
  const current = fleet.find((a) => a.id === wanted) ?? fleet.find((a) => a.owner_id === user.id) ?? fleet[0] ?? null;
  const owner = current?.owner_id === user.id;

  const [{ backups }, role, counts] = await Promise.all([
    loadSettings(supabase, user.id),
    current && !owner
      ? supabase.from("aircraft_share").select("role").eq("aircraft_id", current.id).ilike("invited_email", user.email ?? "").maybeSingle().then((r) => r.data?.role ?? "viewer")
      : Promise.resolve(owner ? "owner" : null),
    current
      ? Promise.all(
          (["page", "log_entry", "document"] as const).map((t) =>
            supabase.from(t).select("id", { count: "exact", head: true }).eq("aircraft_id", current.id).then((r) => r.count ?? 0),
          ),
        )
      : Promise.resolve(null),
  ]);
  const canImport = role === "owner" || role === "editor";
  const tail = current?.tail_number ?? "";
  const a = current ? `/aircraft/${current.id}` : "";

  return (
    <HangarShell user={user} profile={profile} fleet={fleet}>
      <Board section="setup">
        <BoardHead title="Import and export" spine={false} />
        <Leaves split="1.4fr 1fr">
          <Leaf label="Import">
            {current ? (
              <>
                <AircraftSelect aircraft={fleet.map((x) => ({ id: x.id, tail: x.tail_number }))} current={current.id} />
                <div id="import" className="mt-5 scroll-mt-4">
                  <HungSection title={`Import a CSV into ${tail}`} first>
                    {canImport ? (
                      <div className="grid max-w-[60ch] gap-3 text-body">
                        <p>
                          Coming from another tracker or your own spreadsheet? Upload the CSV, check what each column means once, and every row is read the
                          same way.
                        </p>
                        <p className="text-small text-ink-3">CSV only, up to 5 MB and 5,000 rows. Any spreadsheet saves as CSV.</p>
                        <span>
                          <Button variant="primary" href={`${a}/import`}>Import a CSV into {tail}</Button>
                        </span>
                        <p className="rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3 text-small">
                          Imported entries arrive as read, not confirmed, so nothing changes what is due until you review them.
                        </p>
                      </div>
                    ) : (
                      <p className="text-body text-ink-2">You can view {tail}, so importing is for its owner and editors. Export is open to you.</p>
                    )}
                  </HungSection>
                  <HungSection title="Restore">
                    <p className="mb-3 max-w-[60ch] text-body">
                      Restore from a MyTailLog backup. It comes back as a new aircraft, scans and all, and never overwrites one you have.
                    </p>
                    <Link href="/hangar#import" className={buttonClass("secondary", "s")}>Restore from a backup</Link>
                  </HungSection>
                </div>
              </>
            ) : (
              <div className="grid gap-3">
                <p className="text-body">No aircraft yet, so there is nothing to import into or export.</p>
                <span className="flex gap-2">
                  <Button variant="primary" href="/aircraft/new">Add an aircraft</Button>
                  <Button href="/hangar#import">Restore from a backup</Button>
                </span>
              </div>
            )}
          </Leaf>
          <Leaf label="Take it with you">
            <h2 className="text-heading">Take it with you</h2>
            {current && counts && (
              <div id="export" className="scroll-mt-4">
                <HungSection title="Everything" first>
                  <p className="mb-1 text-body font-semibold">Full backup, .zip</p>
                  <p className="mb-3 text-body text-ink-2">
                    {counts[0].toLocaleString("en-US")} scans, every entry ({counts[1].toLocaleString("en-US")}), {counts[2].toLocaleString("en-US")} documents,
                    with a README describing each file. Re-imports in one step.
                  </p>
                  <BackupDownload aircraftId={current.id} />
                </HungSection>
                <HungSection title="Spreadsheets">
                  <ul className="flex flex-wrap gap-2">
                    {CSV.map(([type, label]) => (
                      <li key={type}>
                        <a href={`/api/aircraft/${current.id}/export?type=${type}`} className={buttonClass("secondary", "s")} download>
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </HungSection>
                <HungSection title="Printouts">
                  <ul className="flex flex-wrap gap-2">
                    <li><Link href={`${a}/share/summary`} className={buttonClass("secondary", "s")}>Maintenance summary</Link></li>
                    <li><a href={`${a}/export?ui=v1`} className={buttonClass("secondary", "s")}>Every entry</a></li>
                  </ul>
                </HungSection>
              </div>
            )}
            <div id="backups" className="scroll-mt-4">
              <HungSection title="Automatic backups" first={!current}>
                <AutoBackups backups={backups} aircraftId={current?.id ?? null} owner={owner} />
              </HungSection>
            </div>
            <HungSection title="Leaving">
              <p className="text-body text-ink-2">
                You can leave whenever you like. Open formats, no reader required,{" "}
                <a href="https://github.com/iiamit/MyTailLog" className="font-semibold underline decoration-dotted">MIT licensed and self-hostable</a>.
              </p>
            </HungSection>
          </Leaf>
        </Leaves>
      </Board>
    </HangarShell>
  );
}

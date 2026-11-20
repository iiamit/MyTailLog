import { createClient } from "@/lib/supabase/server";
import { HangarShell } from "@/ui/HangarShell";
import { PublicRoot, PublicTheme } from "@/components/PublicTheme";
import { ReadLeaf, type TocItem } from "@/components/public/Read";
import type { PublicGroup } from "@/lib/publicNav";

/** Help, API docs and release notes stay public; signed-in readers keep the Hangar rail around the same Read leaf. */
export async function InformationShell({
  group,
  path,
  title,
  lede,
  toc,
  children,
}: {
  group: PublicGroup;
  path: string;
  title: string;
  lede?: React.ReactNode;
  toc?: TocItem[];
  children: React.ReactNode;
}) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const leaf = <ReadLeaf intro={lede} toc={toc}>{children}</ReadLeaf>;
  if (!user) return <PublicTheme group={group} path={path} title={title}>{leaf}</PublicTheme>;
  const [{ data: profile }, { data: fleet }] = await Promise.all([
    db.from("profile").select("full_name, is_admin").eq("id", user.id).maybeSingle(),
    db.from("aircraft").select("id, tail_number, make, model").order("tail_number"),
  ]);
  return (
    <PublicRoot>
      <HangarShell user={user} profile={profile} fleet={fleet ?? []}>
        <div data-section="setup" className="board h-dvh overflow-y-auto bg-board px-[22px] pb-[22px] text-on-board max-lg:px-3">
          <header className="board-head flex min-h-[78px] items-end px-1 pt-4">
            <h1 id="board-title" className="mb-3.5 text-board-title max-lg:text-[24px]">{title}</h1>
          </header>
          <main id="main-content" tabIndex={-1} className="outline-none">{leaf}</main>
        </div>
      </HangarShell>
    </PublicRoot>
  );
}

import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel } from "@/lib/mapModel";
import { buildDossier, buildSummary, loadShareInput, summaryText } from "@/lib/share/model";
import { Board, BoardHead, Leaf, Leaves, Spine } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { DossierArticle, SummaryArticle } from "@/ui/share/Articles";
import { CopyText } from "./ShareForms";
import { shareTabs } from "./tabs";

/**
 * W-SHARE-03 and W-SHARE-04: the document on light paper whatever the theme (a nested light scope), from the same view
 * model as the PDF that "Print or save PDF" opens (lib/pdf/render.tsx). The PDF is the printed copy; this is its preview.
 */
export async function PrintPreview({ aircraftId, kind }: { aircraftId: string; kind: "dossier" | "summary" }) {
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, aircraftId), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${aircraftId}`;
  const [due, share] = await Promise.all([
    dueSnapshot(aircraftId, auth.user.id).catch(() => null),
    loadShareInput(supabase, aircraftId, auth.user.id).catch(() => null),
  ]);
  const summary = share && kind === "summary" ? buildSummary(share) : null;
  const dossier = share && kind === "dossier" ? buildDossier(share) : null;
  const title = kind === "dossier" ? "Pre-buy dossier" : "Maintenance summary";
  return (
    <Board section="share">
      <BoardHead
        title="Share"
        subTabs={shareTabs(aircraftId, kind, context.isOwner)}
        actions={
          <>
            {kind === "dossier" && context.isOwner && (
              <a href={`${a}/share?audience=buyer`} className={buttonClass("on-board")}>Share with a buyer</a>
            )}
            {summary && <CopyText text={summaryText(summary)} />}
            <a href={`/api/aircraft/${aircraftId}/${kind}`} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
              <Printer aria-hidden size={18} /> Print or save PDF
            </a>
          </>
        }
      />
      <Spine
        tail={context.reg}
        context="whole record"
        href={`${a}/logbooks/map`}
        model={due ? buildMapModel(due.loaded.input, due.loaded.today) : null}
        statusHref={`${a}/status`}
      />
      <Leaves split="1fr" mapFirst>
        <Leaf label={`${title}, print preview`} flush className="bg-leaf-2">
          {/* The light scope's own base rule paints the cover colour, so it stays transparent and the sheet sits inside it. */}
          <div data-ui="v2" data-theme="light" style={{ background: "transparent" }} className="mx-auto my-6 max-w-[880px]">
            <div className="rounded-[var(--radius-s)] bg-leaf px-12 py-10 text-ink shadow-leaf max-sm:px-5">
              {summary && <SummaryArticle m={summary} />}
              {dossier && <DossierArticle m={dossier} />}
              {!share && <p className="text-body text-ink-2">The {title.toLowerCase()} could not be made. Reload the page to try again.</p>}
            </div>
          </div>
        </Leaf>
      </Leaves>
    </Board>
  );
}

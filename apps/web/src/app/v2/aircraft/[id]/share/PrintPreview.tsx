import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel } from "@/lib/mapModel";
import { Board, BoardHead, Leaf, Leaves, Spine } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { shareTabs } from "./tabs";

/**
 * W-SHARE-03 and W-SHARE-04: the printed document itself, on light paper whatever the theme. The preview is the
 * server's PDF (lib/pdf/render.tsx, from the same view model as every other screen), so what you see is what prints.
 */
export async function PrintPreview({
  aircraftId,
  kind,
  actions,
}: {
  aircraftId: string;
  kind: "dossier" | "summary";
  actions?: (ctx: { isOwner: boolean; canEdit: boolean; userId: string }) => React.ReactNode;
}) {
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, aircraftId), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${aircraftId}`;
  const due = await dueSnapshot(aircraftId, auth.user.id).catch(() => null);
  const pdf = `/api/aircraft/${aircraftId}/${kind}`;
  const title = kind === "dossier" ? "Pre-buy dossier" : "Maintenance summary";
  return (
    <Board section="share">
      <BoardHead
        title="Share"
        subTabs={shareTabs(aircraftId, kind, context.isOwner)}
        actions={
          <>
            {actions?.({ isOwner: context.isOwner, canEdit: context.canEdit, userId: auth.user.id })}
            <a href={pdf} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
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
        <Leaf label={`${title}, print preview`} flush className="flex flex-col bg-leaf-2">
          <iframe src={`${pdf}#view=FitH`} title={`${title} for ${context.reg}, as it prints`} className="min-h-0 w-full flex-1 border-0" />
          <p className="px-5 py-2 text-small text-ink-3">
            Only confirmed entries are used. The paper logbooks remain the legal record (14 CFR 91.417).
          </p>
        </Leaf>
      </Leaves>
    </Board>
  );
}

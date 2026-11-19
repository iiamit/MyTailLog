import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { buildSummary, loadShareInput, summaryText } from "@/lib/share/model";
import { aircraftTail } from "@/lib/v2/landing";
import { CopyText } from "../ShareForms";
import { PrintPreview } from "../PrintPreview";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Maintenance summary · ${await aircraftTail(id)}` };
}

/** W-SHARE-04 Maintenance summary. */
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PrintPreview
      aircraftId={id}
      kind="summary"
      actions={async ({ userId }) => {
        const share = await loadShareInput(await createClient(), id, userId).catch(() => null);
        return share && <CopyText text={summaryText(buildSummary(share))} />;
      }}
    />
  );
}

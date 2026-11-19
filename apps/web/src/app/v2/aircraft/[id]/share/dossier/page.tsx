import type { Metadata } from "next";
import { aircraftTail } from "@/lib/v2/landing";
import { Button } from "@/ui/Button";
import { PrintPreview } from "../PrintPreview";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Pre-buy dossier · ${await aircraftTail(id)}` };
}

/** W-SHARE-03 Pre-buy dossier. */
export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PrintPreview
      aircraftId={id}
      kind="dossier"
      actions={({ isOwner }) => isOwner && <Button variant="on-board" href={`/aircraft/${id}/share?audience=buyer`}>Share with a buyer</Button>}
    />
  );
}

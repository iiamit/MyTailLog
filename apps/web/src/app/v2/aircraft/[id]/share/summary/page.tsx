import type { Metadata } from "next";
import { aircraftTail } from "@/lib/v2/landing";
import { PrintPreview } from "../PrintPreview";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Maintenance summary · ${await aircraftTail(id)}` };
}

/** W-SHARE-04 Maintenance summary. */
export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  return <PrintPreview aircraftId={(await params).id} kind="summary" />;
}

import { redirect } from "next/navigation";

/** `/logbooks` opens the map (03 §10). */
export default async function LogbooksIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/aircraft/${id}/logbooks/map`);
}

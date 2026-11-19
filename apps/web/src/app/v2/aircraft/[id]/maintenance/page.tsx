import { redirect } from "next/navigation";

/** 03 §9: Maintenance opens on its first sub-tab. */
export default async function MaintenanceIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/aircraft/${id}/maintenance/items`);
}

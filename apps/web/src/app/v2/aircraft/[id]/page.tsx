import { redirect } from "next/navigation";

// An aircraft's home is its Status board (03 §9.3, 307).
export default async function V2AircraftHome({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/aircraft/${(await params).id}/status`);
}

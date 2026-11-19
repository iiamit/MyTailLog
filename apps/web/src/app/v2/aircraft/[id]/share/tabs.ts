import type { SubTab } from "@/ui/Board";

/** Share sub-tabs (03 §4): Links and people is the owner's only. */
export function shareTabs(aircraftId: string, current: "links" | "dossier" | "summary", isOwner: boolean): SubTab[] {
  const a = `/aircraft/${aircraftId}/share`;
  return [
    ...(isOwner ? [{ label: "Links and people", href: a, current: current === "links" }] : []),
    { label: "Pre-buy dossier", href: `${a}/dossier`, current: current === "dossier" },
    { label: "Maintenance summary", href: `${a}/summary`, current: current === "summary" },
  ];
}

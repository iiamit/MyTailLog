export type DeliveryDecision = "synced" | "sync" | "pending";

export function deliveryDecision(online: boolean, queued: number): DeliveryDecision {
  if (queued === 0) return "synced";
  return online ? "sync" : "pending";
}

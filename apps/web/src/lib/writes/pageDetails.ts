import { replayRpc } from "./replay";
import type { Db, WriteCtx, WriteResult } from "./entries";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateDetailDecision(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "A review decision is required.";
  const d = input as Record<string, unknown>;
  if (d.action === "classify") return Array.isArray(d.kinds) && d.kinds.length > 0 && d.kinds.length <= 5 && d.kinds.every((k) => ["identity", "equipment", "maintenance", "reference", "blank"].includes(String(k))) ? null : "Choose the page contents.";
  if (!["accept", "dismiss"].includes(String(d.action)) || typeof d.suggestionId !== "string" || !/^[a-f0-9]{24}$/.test(d.suggestionId)) return "Choose a suggestion and a decision.";
  if (d.action === "dismiss") return null;
  if (!d.fields || typeof d.fields !== "object" || Array.isArray(d.fields) || !Object.keys(d.fields).length) return "Enter at least one detail.";
  if (Object.entries(d.fields).some(([k, v]) => !["make", "model", "serial_number", "part_number", "tail_number"].includes(k) || typeof v !== "string" || !v.trim() || v.length > 200)) return "Details must be text of 1–200 characters.";
  if (d.targetId != null && (typeof d.targetId !== "string" || !UUID.test(d.targetId))) return "Choose the equipment record.";
  if (d.targetBase != null && (typeof d.targetBase !== "string" || !Number.isFinite(Date.parse(d.targetBase)))) return "Reload the current record before accepting.";
  if (d.installed != null && typeof d.installed !== "boolean") return "Confirm whether this equipment is installed today.";
  return null;
}

/** Shared by the browser and the replay-safe native outbox. SQL checks both page and destination versions. */
export async function reviewDetails(db: Db, ctx: WriteCtx, input: { pageId: string; decision: unknown }, base?: string): Promise<WriteResult> {
  const error = validateDetailDecision(input.decision);
  if (error || !base || !UUID.test(input.pageId)) return { status: "error", message: error ?? "Reload this page before reviewing its details.", httpStatus: 400 };
  const result = await replayRpc(db, ctx, "review_page_details", { p_aircraft: ctx.aircraftId, p_page: input.pageId, p_base: base, p_decision: input.decision });
  return result.error ? { status: "error", message: result.error.message } : result.data as WriteResult;
}

import type { MutationType } from "@/lib/sync/mutations";
import { stubs } from "./_stubs";
import type { WriteFn } from "./_stubs";
import * as entries from "./entries";
import * as pages from "./pages";

export type { Db, WriteCtx, WriteResult, WriteFn } from "./_stubs";

// The dispatch table: MutationType → the ONE write function (CONTRACT §2, §4).
// POST /api/sync/push and the legacy /actions route look up `writes[type]`.
//
// `...stubs` first so any type nobody has lifted yet still answers
// "not lifted yet" instead of crashing the batch; the real modules below win
// wherever they exist.
//
// Online-only types (page.extract, mx.scan, equipment.scan, aircraft.enroll,
// backup.run) stay on their Bearer routes; validateMutation refuses them
// before dispatch, so their stub rows never run.
export const writes: Record<MutationType, WriteFn> = {
  ...stubs,

  // writes-c1
  "entry.create": entries.create,
  "entry.update": entries.update,
  "entry.confirm": entries.setConfirmed,
  "entry.delete": entries.remove,
  "entry.merge": entries.mergeContinuation,
  "entry.setLinks": entries.setLinks,
  "entries.confirmClean": entries.confirmClean,
  "page.review": pages.setReview,
  "page.reorder": pages.reorder,
  "page.delete": pages.deletePages,
};

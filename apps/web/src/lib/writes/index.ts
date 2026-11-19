import type { MutationType } from "@/lib/sync/mutations";
import { stubs } from "./_stubs";
import type { WriteFn } from "./_stubs";
import * as entries from "./entries";
import * as pages from "./pages";
import * as meters from "./meters";
import * as maintenance from "./maintenance";
import * as compliance from "./compliance";
import * as equipment from "./equipment";
import * as squawks from "./squawks";
import * as documents from "./documents";
import * as oil from "./oil";
import * as weightBalance from "./weightBalance";
import * as gaps from "./gaps";

import * as visits from "./visits";
import * as providers from "./providers";
import * as timeChecks from "./timeChecks";
import * as aircraft from "./aircraft";
import * as reminders from "./reminders";

export type { Db, WriteCtx, WriteResult, WriteFn } from "./_stubs";

/**
 * Phase 4 push types (09 §5.3) with their base rule, written here because lib/sync/mutations.ts
 * belongs to the sync stream. To switch them on, copy each row into MUTATIONS there (and the
 * Kotlin mirror in apps/core/domain Mutations.kt already lists them). Until then the push route
 * answers "Unknown change type" for them, while the write functions below are live for the web.
 */
export const PHASE4_MUTATIONS = {
  "visit.create": { base: "never" },
  "visit.update": { base: "always" },
  "visit.setStatus": { base: "always" },
  "visitSuggestion.dismiss": { base: "never" },
  "provider.upsert": { base: "ifId" },
  "provider.delete": { base: "always" },
  "squawkPhoto.create": { base: "never" },
  "squawkPhoto.delete": { base: "always" },
  "document.setExpiry": { base: "always" },
  "timeCheck.dismiss": { base: "never" },
  "aircraft.setExpectedHours": { base: "always" },
  "aircraft.setSituation": { base: "always" },
} as const satisfies Record<string, { base: "never" | "always" | "ifId" }>;
export type Phase4MutationType = keyof typeof PHASE4_MUTATIONS;

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
export const writes: Record<MutationType | Phase4MutationType, WriteFn> = {
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
  "page.register": pages.register,
  "batch.create": pages.createBatch,
  "page.duplicateDecision": pages.duplicateDecision,
  "gap.setStatus": gaps.setStatus,
  "gap.create": gaps.create,

  // writes-c2
  "reading.create": meters.addReading,
  "reading.update": meters.updateReading,
  "reading.delete": meters.deleteReading,
  "meterReset.create": meters.addReset,
  "meterReset.delete": meters.deleteReset,
  "mx.upsert": maintenance.upsert,
  "mx.delete": maintenance.remove,
  "mx.complete": maintenance.markDone,
  "mx.seedStandard": maintenance.seedStandard,
  "ad.upsert": compliance.upsert,
  "ad.delete": compliance.remove,
  "ad.track": compliance.track,
  "component.upsert": equipment.upsert,
  "component.delete": equipment.remove,
  "component.remove": equipment.markRemoved,
  "component.reinstall": equipment.reinstall,
  "proposals.confirm": equipment.confirmProposals,
  "proposals.dismiss": equipment.dismissProposals,

  // writes-c3
  "squawk.create": squawks.create,
  "squawk.resolve": squawks.resolve,
  "squawk.reopen": squawks.reopen,
  "squawk.update": squawks.update,
  "squawk.delete": squawks.remove,
  "oil.create": oil.addTopOff,
  "oil.delete": oil.deleteTopOff,
  "document.update": documents.update,
  "document.setEntry": documents.setEntry,
  "document.delete": documents.remove,
  "wb.upsert": weightBalance.upsert,
  "wb.delete": weightBalance.remove,

  // phase 4 (PHASE4_MUTATIONS)
  "visit.create": visits.create,
  "visit.update": visits.update,
  "visit.setStatus": visits.setStatus,
  "visitSuggestion.dismiss": visits.dismissSuggestion,
  "provider.upsert": providers.upsert,
  "provider.delete": providers.remove,
  "squawkPhoto.create": squawks.addPhoto,
  "squawkPhoto.delete": squawks.removePhoto,
  "document.setExpiry": documents.setExpiry,
  "timeCheck.dismiss": timeChecks.dismiss,
  "aircraft.setExpectedHours": aircraft.setExpectedHours,
  "aircraft.setSituation": aircraft.setSituation,

  // phase 6
  "reminder.snooze": reminders.snooze,
};

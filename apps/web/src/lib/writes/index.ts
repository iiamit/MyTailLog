import type { MutationType } from "@/lib/sync/mutations";
import { stubs } from "./_stubs";
import type { WriteFn } from "./_stubs";

export type { Db, WriteCtx, WriteResult, WriteFn } from "./_stubs";

// The dispatch table: MutationType → the ONE write function (CONTRACT §2, §4).
// POST /api/sync/push and the legacy /actions route look up `writes[type]`.
//
// INTEGRATION WIRING — as each writes stream merges, spread its module over the
// stubs so a real function wins wherever one exists and a stub answers "not
// lifted yet" everywhere else. The intended final table:
//
//   import * as entries from "./entries";             // writes-c1
//   import * as pages from "./pages";                 // writes-c1
//   import * as meters from "./meters";               // writes-c2
//   import * as maintenance from "./maintenance";     // writes-c2
//   import * as compliance from "./compliance";       // writes-c2
//   import * as equipment from "./equipment";         // writes-c2
//   import * as squawks from "./squawks";             // writes-c3
//   import * as documents from "./documents";         // writes-c3
//   import * as oil from "./oil";                     // writes-c3
//   import * as weightBalance from "./weightBalance"; // writes-c3
//
//   export const writes: Record<MutationType, WriteFn> = {
//     ...stubs,
//     "entry.create": entries.create,
//     "entry.update": entries.update,
//     "entry.confirm": entries.setConfirmed,
//     "entry.delete": entries.remove,
//     "entry.merge": entries.mergeContinuation,
//     "entry.setLinks": entries.setLinks,
//     "entries.confirmClean": entries.confirmClean,
//     "page.review": pages.setReview,
//     "page.reorder": pages.reorder,
//     "page.delete": pages.deletePages,
//     "reading.create": meters.addReading,
//     "reading.update": meters.updateReading,
//     "reading.delete": meters.deleteReading,
//     "meterReset.create": meters.addReset,
//     "meterReset.delete": meters.deleteReset,
//     "mx.upsert": maintenance.upsert,
//     "mx.delete": maintenance.remove,
//     "mx.complete": maintenance.markDone,
//     "mx.seedStandard": maintenance.seedStandard,
//     "ad.upsert": compliance.upsert,
//     "ad.delete": compliance.remove,
//     "ad.track": compliance.track,
//     "component.upsert": equipment.upsert,
//     "component.delete": equipment.remove,
//     "component.remove": equipment.markRemoved,
//     "component.reinstall": equipment.reinstall,
//     "proposals.confirm": equipment.confirmProposals,
//     "proposals.dismiss": equipment.dismissProposals,
//     "squawk.create": squawks.create,
//     "squawk.resolve": squawks.resolve,
//     "squawk.reopen": squawks.reopen,
//     "squawk.update": squawks.update,
//     "squawk.delete": squawks.remove,
//     "oil.create": oil.addTopOff,
//     "oil.delete": oil.deleteTopOff,
//     "document.update": documents.update,
//     "document.setEntry": documents.setEntry,
//     "document.delete": documents.remove,
//     "wb.upsert": weightBalance.upsert,
//     "wb.delete": weightBalance.remove,
//   };
//
// Online-only types (page.extract, mx.scan, equipment.scan, aircraft.enroll,
// backup.run) stay on their Bearer routes; validateMutation refuses them
// before dispatch, so their stub rows never run.
//
// This branch (core-sync) predates every domain module, so the table is stubs
// only. Do NOT add a domain import here until that module exists on ios-parity.
export const writes: Record<MutationType, WriteFn> = { ...stubs };

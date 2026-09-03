# iOS parity — the contract

This is the interface every workstream builds against. It is short on purpose:
read all of it before touching code. Plan of record:
https://claude.ai/code/artifact/239f484e-ae33-455a-912f-8e72e6250fd8

Safe point: tag `pre-ios-parity` (main @ 60c9c87). Integration branch: `ios-parity`.
Each stream works on `ios-parity-<stream>` (hyphen — git refuses `ios-parity/<stream>` while the branch `ios-parity` exists) in its own worktree, branched from `origin/ios-parity`, and pushes it.
Nothing merges to `main` from inside the build.

## 1. Rules that apply to every stream

0. **Start from the contract commit, not from wherever the worktree opened.** A fresh worktree may be checked out at `main`. First: `git fetch origin && git checkout -B ios-parity-<stream> origin/ios-parity`.

1. **UI code never calls Supabase and never calls a server action.** On the
   phone, every write goes through `enqueue()` in `apps/mobile/src/mutations.ts`
   by mutation type (§3). On the web, every write goes through a function in
   `apps/web/src/lib/writes/*` (§4). There is no third way.
2. **Own your files; request changes to everyone else's.** The ownership table
   is §8. If you need a change in a file you don't own, put the exact change in
   your PR description under "Requests for <owner>" and the owner applies it.
   Do not edit it yourself, even trivially.
3. **Pure logic is tested from `apps/web/test`.** `apps/mobile` has no runner.
   Anything with a branch in it lives in a dependency-free module (no Capacitor,
   no `import.meta.env`, no `next/*`) and gets a `node:test` file in
   `apps/web/test/`. Precedent: `history.ts`, `sync-apply.ts`, `documents-search.ts`,
   `pageStatus.ts`. A type-only import of a tainted module still taints.
4. **Mobile imports from web are one-way and pure only.** `@/lib/*` resolves
   into `apps/web/src`; import only modules with no `next/server`, no cookie
   client, no server action. Nothing in `apps/web` may import from `apps/mobile`.
5. **Editable controls are 16px or larger** (`input`, `textarea`, `select`).
   WKWebView zooms a focused control below that and leaves the app panned.
   See `apps/mobile/README.md`. No viewport or width workarounds.
6. **Hit targets ≥ 44pt. Tokens from `apps/mobile/src/tokens.ts` only.** No new
   colors, no new font families. Copy in the owner's language: never "queue",
   "confidence", ISO dates, or a bare FAR number as a title.
7. **Every RLS-scoped write reads its effect back.** A viewer's UPDATE/DELETE
   matches zero rows and returns no error. Check `can_edit_aircraft` explicitly
   and `.select()` the affected rows; never infer success from the absence of an
   error. (Shipped bugs: N1, #185's bulk delete.)
8. **Deleting a row: grep the migrations for `references <table>(id)` first**
   and decide per foreign key whether the reference moves or dies. (#188.)
9. **Migrations**: only the numbers reserved in §7. Add any new synced table to
   the `log_change()` trigger AND a backfill, or a fresh device never sees its
   rows (0045 lesson). Migrations are applied by the user to prod and test —
   list them in your PR under "Migrations".
10. **Definition of done** (§10) before a PR is opened. PRs target `ios-parity`.

## 2. The write path

```
phone: enqueue(type, aircraftId, payload, base?)      web: server action
          │  action_queue (SQLite)                              │  thin wrapper
          ▼                                                     ▼
       POST /api/sync/push  ─────────────────────────►  lib/writes/<domain>.<fn>()
       Bearer · can_edit · compare base                 the ONE implementation
          │                                                     │
          ▼                                                     ▼
       { ok | conflict | error } per mutation           revalidatePath()
```

### Envelope

```ts
// POST /api/sync/push   (Bearer; createSyncClient)
type Mutation = {
  id: string;            // client UUID — the idempotency key. For inserts it is
                         // the new row's id (or external_ref for hours_reading).
  type: MutationType;    // §3
  aircraftId: string;
  payload: unknown;      // §3, per type
  base?: string;         // ISO updated_at of the row being changed, as the
                         // phone last saw it. REQUIRED for every update/delete
                         // type. Absent on inserts.
};
// body: { mutations: Mutation[] }   max 100

type PushResult = {
  id: string;
  status: "ok" | "conflict" | "error";
  row?: Record<string, unknown>;   // ok: the row after the write (or null for
                                   //     delete). conflict: the CURRENT row.
  error?: string;                  // error: owner-readable message
};
// response: { results: PushResult[] }   one per mutation, same order
```

### Conflict rule (optimistic concurrency, yours/theirs — decided)

For any update/delete type: load the row; if `Date.parse(row.updated_at) >
Date.parse(base)` → return `conflict` with the current row and write nothing.
Otherwise apply. `base` missing on an update/delete type → `error`.

The phone keeps a conflicted action queued with `status='conflict'` and the
server's row, and shows a yours/theirs screen (owned by core sync). *Keep mine*
re-submits with `base` = the server row's `updated_at`; *Take theirs* drops the
action. Nothing is ever silently overwritten in either direction.

Inserts stay conflict-free (`onConflict: id, ignoreDuplicates`), as today.

### Backward compatibility (non-negotiable)

Phones in the field run the current build and POST the four legacy types
(`reading | oil | squawk | mx_complete`) to `POST /api/aircraft/[id]/actions`.
That route keeps working for one release, delegating to the same `lib/writes`
functions. `mx_complete` gains the base check when the new build sends `base`;
without `base` it behaves as today (documented LWW hazard — accepted for old
builds only).

## 3. Mutation catalogue

`MutationType` is the union of every `type` below. Payloads are JSON. `→` names
the `lib/writes` function. **(base)** = update/delete, carries `base`.
**(online)** = needs network; the phone shows "Needs a connection — queued".

| stream | type | payload | → function |
|---|---|---|---|
| C1 | `entry.create` | `{id, logbookId, pageId?, fields: EntryFields}` | `entries.create` |
| C1 | `entry.update` (base) | `{entryId, fields: Partial<EntryFields>}` | `entries.update` |
| C1 | `entry.confirm` (base) | `{entryId, confirmed: boolean}` | `entries.setConfirmed` |
| C1 | `entry.delete` (base) | `{entryId}` | `entries.remove` |
| C1 | `entry.merge` (base of tail) | `{tailEntryId}` | `entries.mergeContinuation` (#188 relink included) |
| C1 | `entry.setLinks` (base) | `{entryId, links: {label: string, url: string}[]}` — the column is `log_entry.reference_links`; document↔entry attachment is `document.setEntry` (C3) | `entries.setLinks` |
| C1 | `entries.confirmClean` | `{}` | `entries.confirmClean` |
| C1 | `page.review` (base) | `{pageId, status: "unreviewed"\|"confirmed"\|"disputed"}` | `pages.setReview` |
| C1 | `page.reorder` | `{logbookId, orderedIds: string[]}` | `pages.reorder` |
| C1 | `page.delete` | `{pageIds: string[]}` | `pages.deletePages` (exists in `aircraft/[id]/actions.ts` — move it) |
| C1 | `page.extract` (online) | `{pageId}` | route `POST /api/pages/[id]/extract` made Bearer; push returns `error` "needs connection" if offline |
| C2 | `reading.create` | `{id, date, tach?, hobbs?, airframe?}` | `meters.addReading` (today's `reading`) |
| C2 | `reading.update` (base) | `{readingId, date?, tach?, hobbs?, airframe?}` | `meters.updateReading` |
| C2 | `reading.delete` (base) | `{readingId}` | `meters.deleteReading` |
| C2 | `meterReset.create` | `{id, meter, date, prior, next}` | `meters.addReset` |
| C2 | `meterReset.delete` (base) | `{resetId}` | `meters.deleteReset` |
| C2 | `mx.upsert` (base when id present) | `{id?, item: MaintenanceItemFields}` | `maintenance.upsert` |
| C2 | `mx.delete` (base) | `{itemId}` | `maintenance.remove` |
| C2 | `mx.complete` (base) | `{itemId, date, hours?, description?, workPerformed?, tach?, hobbs?, signature?, logbookId?}` — `notes` is not a log_entry column | `maintenance.markDone` (today's `mx_complete`) |
| C2 | `mx.seedStandard` | `{}` | `maintenance.seedStandard` |
| C2 | `ad.upsert` (base when id present) | `{id?, record: AdComplianceFields}` | `compliance.upsert` |
| C2 | `ad.delete` (base) | `{recordId}` | `compliance.remove` |
| C2 | `ad.track` | `{id, reference, ...}` — the column is `reference`, not `ref` | `compliance.track` |
| C2 | `component.upsert` (base when id present) | `{id?, component: ComponentFields}` | `equipment.upsert` |
| C2 | `component.delete` (base) | `{componentId}` | `equipment.remove` |
| C2 | `component.remove` (base) | `{componentId, date, entryId?}` | `equipment.markRemoved` |
| C2 | `component.reinstall` (base) | `{componentId}` | `equipment.reinstall` |
| C2 | `proposals.confirm` | `{proposalIds: string[]}` | `equipment.confirmProposals` |
| C2 | `proposals.dismiss` | `{proposalIds: string[]}` | `equipment.dismissProposals` |
| C2 | `mx.scan` / `equipment.scan` (online) | `{}` | routes made Bearer |
| C3 | `squawk.create` | `{id, description, severity, reportedAt}` | `squawks.create` (today's `squawk`) |
| C3 | `squawk.resolve` (base) | `{squawkId, resolvedAt, resolvedEntryId?}` | `squawks.resolve` |
| C3 | `squawk.reopen` (base) | `{squawkId}` | `squawks.reopen` |
| C3 | `squawk.update` (base) | `{squawkId, description?, severity?}` | `squawks.update` |
| C3 | `squawk.delete` (base) | `{squawkId}` | `squawks.remove` |
| C3 | `oil.create` | `{id, date, quarts, tach?, hobbs?}` | `oil.addTopOff` (today's `oil`) |
| C3 | `oil.delete` (base) | `{additionId}` | `oil.deleteTopOff` |
| C3 | `document.update` (base) | `{documentId, fields}` | `documents.update` |
| C3 | `document.setEntry` (base) | `{documentId, entryId: string\|null}` | `documents.setEntry` |
| C3 | `document.delete` (base) | `{documentId}` | `documents.remove` |
| C3 | `document.upload` (online) | blob — via `POST /api/aircraft/[id]/documents` made Bearer, JSON base64 like capture; queued in the blob queue, not `action_queue` | — |
| C3 | `wb.upsert` (base when id present) | `{id?, fields}` | `weightBalance.upsert` |
| C3 | `wb.delete` (base) | `{wbId}` | `weightBalance.remove` |
| C3 | `aircraft.enroll` (online) | `{tail, ...}` | `POST /api/registry` + `aircraft.enroll` route made Bearer |
| C3 | `backup.run` (online) | `{}` | route made Bearer |
| C3 | `ask` (online, streaming) | — | route `POST /api/aircraft/[id]/ask` made Bearer; buffered response |

`EntryFields`, `MaintenanceItemFields`, `AdComplianceFields`, `ComponentFields`
are the existing shapes in each domain's `actions.ts` — reuse, don't redefine.

## 4. `lib/writes` — signatures

One module per domain under `apps/web/src/lib/writes/`. Every function:

```ts
export async function <fn>(
  supabase: SupabaseClient<Database>,   // cookie client (web) or sync client (push)
  ctx: { aircraftId: string; userId: string },
  input: <payload type from §3>,
  base?: string,                        // present on update/delete types
): Promise<WriteResult>

export type WriteResult =
  | { status: "ok"; row: Record<string, unknown> | null }
  | { status: "conflict"; row: Record<string, unknown> }
  | { status: "error"; message: string; httpStatus?: number };
```

Rules: the function does the `can_edit_aircraft` check itself; it never calls
`revalidatePath` (the server-action wrapper does); it never throws for expected
failures (returns `error`); it reads back with `.select()` (Rule 7). The
existing server action becomes:

```ts
export async function saveEntry(...) {
  const supabase = await createClient();
  const r = await entries.update(supabase, ctx, input, base);
  if (r.status !== "ok") return { error: ... };
  revalidatePath(...); return { ok: true };
}
```

The push route (core sync) is a dispatch table `MutationType → fn`. Adding a
type = one row in the table + one function. No type-specific code in the route.

## 5. Layout primitives — `apps/mobile/src/layout.tsx` (owner: iPad shell)

```ts
export type SizeClass = "compact" | "regular";
export function useSizeClass(): SizeClass;   // matchMedia("(min-width: 700px)")
                                              // 700 so iPad half-split stays compact (decided)

export function Sidebar(props: {
  aircraft: Aircraft; fleet: Aircraft[]; worst: Record<string, Urgency>;
  active: Tab; onTab: (t: Tab) => void; onSwitch: (a: Aircraft) => void;
  onSeeAll: () => void; onAccount: () => void;
}): ReactElement | null;                      // regular only; 200pt

export function TwoPane(props: {
  primary: ReactNode;
  secondary: ReactNode | null;
  ratio?: "50/50" | "55/45" | "40/60";        // primary/secondary
}): ReactElement;
// regular: side by side. compact: renders `primary` only — the caller presents
// `secondary` as a sheet or push in that case (the existing phone behaviour).
```

Screen components are NOT rewritten for regular width. Each UI stream delivers
components that take props; the shell composes them into `TwoPane`s per the
plan's table. UI streams put their wiring needs under "Requests for iPad shell".

Keyboard: the shell owns a `useShortcuts(map)` hook; UI streams register
`⌘↩ confirm`, `⌘→/←` page, `⌘N` new squawk, `⌘F` search, `⌘1–4` tabs through it.

Light appearance (owner: platform): `tokens.ts` gains a light set under the same
names; `useTheme()` follows `prefers-color-scheme`. Streams use token names only.

## 6. Stubs — so streams compile on day one

Two stubs are committed with this contract and replaced by their owners:

- `apps/mobile/src/mutations.ts` — `enqueue()` over today's `action_queue`. UI
  streams call it from day one. Core sync replaces its internals (adds `base`,
  the conflict state, the push endpoint). The signature does not change.
- `apps/mobile/src/layout.tsx` — `useSizeClass()` is real; `TwoPane` renders
  `primary` only; `Sidebar` renders nothing. The shell fills them in. The
  signatures do not change.

If you need a signature to change, that is a contract change: request it from
the lead in your PR; do not fork the API.

## 7. Reserved migration numbers

| # | owner | purpose |
|---|---|---|
| 0058 | core sync | `updated_at` audit: every synced table has `updated_at` + a BEFORE UPDATE trigger that bumps it (list any that don't and add them); `ad_reference` and `equipment_proposal` added to the `log_change()` trigger list + backfill |
| 0059 | platform | `device_token` (user_id, token, platform, created_at) for push, RLS owner-scoped |
| 0060 | spare | ask the lead |

## 8. File ownership

| owner | files |
|---|---|
| core sync | `apps/mobile/src/{db,sync,sync-apply,sync-policy,actions,mutations,pending}.ts*`, `apps/web/src/app/api/sync/push/**`, `apps/web/src/app/api/aircraft/[id]/actions/route.ts`, `apps/web/src/lib/sync/**`, migration 0058 |
| writes C1 | `apps/web/src/lib/writes/{entries,pages}.ts`, `apps/web/src/app/aircraft/[id]/pages/[pageId]/review/actions.ts`, `apps/web/src/app/aircraft/[id]/review/actions.ts`, `apps/web/src/app/aircraft/[id]/actions.ts` (page ops), extract route Bearer swap |
| writes C2 | `apps/web/src/lib/writes/{meters,maintenance,compliance,equipment}.ts`, the four matching `actions.ts`, scan routes Bearer swap |
| writes C3 | `apps/web/src/lib/writes/{squawks,documents,oil,weightBalance}.ts`, the matching `actions.ts`, documents/registry/enroll/ask/backup routes Bearer swap |
| iPad shell | `apps/mobile/src/{App,layout,tabbar,switcher}.tsx`, `apps/mobile/src/shortcuts.ts` |
| review UI | `apps/mobile/src/{screens,record-screen,lightbox}.tsx`, new `apps/mobile/src/review-*.tsx`, `apps/mobile/src/entry-editor.tsx` |
| status UI | `apps/mobile/src/{status-screen,complete-screen,airworthiness}.ts*`, new `apps/mobile/src/{item-editor,ad-*,equipment-*}.tsx` |
| records UI | `apps/mobile/src/{records-screen,documents-screen,pdf-screen,squawks-screen,capture-screen,documents-search}.ts*`, new `apps/mobile/src/{document-upload,wb-,oil-,ask-,squawk-detail}*.tsx`, `apps/mobile/src/blobs.ts` upload half |
| platform | `apps/mobile/src/{tokens,index.css,supabase,account-menu,first-run,theme,push}.ts*`, `apps/mobile/ios/App/App/Info.plist`, `apps/mobile/TESTFLIGHT.md`, migration 0059, the cron sender for push |
| design | the Claude Design project (DesignSync) — screens 12–24 |
| lead | this file, `CHANGELOG.md`, `apps/web/src/app/help/page.tsx`, `apps/mobile/README.md`, `docs/mobile-and-sync.md` |

Files not listed: ask the lead before touching.

## 9. Integration order

contracts → core sync → writes C1, C2, C3 (any order) → iPad shell → review UI
→ status UI → records UI → platform → docs. Each merge into `ios-parity` must
have `tsc` (both apps), `lint`, and the unit suite green. `e2e` runs on the PR
from `ios-parity` to `main` and needs 0058/0059 applied to the test project.

## 10. Definition of done, per stream

- Branch `ios-parity-<stream>` pushed; PR opened against `ios-parity`.
- `cd apps/web && npx tsc --noEmit && npm run lint` clean;
  `cd apps/mobile && npx tsc --noEmit && npx vite build` clean.
- New pure logic has tests in `apps/web/test/`, and the full suite passes.
- No edits outside your owned files. Requests for other owners are in the PR.
- PR body has: **Scope**, **Mutation types added** (if any), **Requests for
  <owner>**, **Migrations**, **Device checklist** (what a human must try on an
  iPhone and an iPad — be specific: which screen, which action, expected result).
- Copy reviewed against Rule 6. Controls against Rule 5.

## 11. Decisions from runs 1–2 (read this before starting)

Five streams are DONE and pushed. Branch each new stream from `origin/ios-parity`
and treat these as settled:

| stream | branch | state |
|---|---|---|
| writes-c1 | `ios-parity-writes-c1` | done, PR #189 |
| writes-c2 | `ios-parity-writes-c2` | done, PR #192 (stacked on c1) |
| writes-c3 | `ios-parity-writes-c3` | done, PR #191 (stacked on c1) |
| ipad-shell | `ios-parity-ipad-shell` | done, PR #190 |
| core-sync | `ios-parity-core-sync` | done, incl. migration 0058 |

Partial work rescued from agents the session limit killed — **cherry-pick it, do
not start over**: `ios-parity-review-ui-partial`, `ios-parity-status-ui-partial`,
`ios-parity-design-partial`. Each is one unverified WIP commit.

**Schema questions are answered by 0058** (on `ios-parity-core-sync`): it adds
`updated_at` to `oil_addition`, `adsb_flight`, `equipment_proposal`; adds the
missing BEFORE UPDATE triggers to `squawk` and `hours_reading`; puts
`ad_reference` and `equipment_proposal` in the change feed with a backfill; and
drops `change_log.aircraft_id`'s NOT NULL because `ad_reference` is global. So
`base` works for every update/delete type once 0058 is applied.

**Cross-stream wiring, decided by the lead** (ipad-shell asked; these are binding):
- **status-ui** exports `AllItems` from `status-screen.tsx` as a self-contained
  component that takes its own props (aircraft + a computed Airworthiness) and
  does not require `onBack`. The shell renders it as the Status secondary pane.
- **review-ui** registers the `⌘←` / `⌘→` page chords *inside* `PageViewer`,
  because the page index lives in its state. Use the shell's `useShortcuts`.
- **records-ui** names the selection shape for the squawk and document detail
  panes (e.g. `Sub = {kind:'squawk', id} | {kind:'document', id} | …`) and puts
  it in its PR under "Requests for iPad shell"; the shell adds it to the Nav union.

**Also settled:** `POST /api/aircraft/enroll` is C3's file (approved).
`POST /api/aircraft/[id]/backup/run` schedules the next sweep rather than
building an archive inline — that is the right call; say so in the UI copy
("Backup scheduled" not "Backup created"). writes-c2/c3 are stacked on
writes-c1 because they share `WriteResult`/`WriteCtx` from `lib/writes/entries.ts`;
the integration order already merges c1 first, so this resolves itself.

**If the contract still disagrees with the real schema, the schema wins** —
implement against the column and report it. Two rows above were wrong; assume
more may be.

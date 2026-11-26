# Build your aircraft profile from its logbooks

You can upload logbooks before completing aircraft setup. Enter the minimum information to add the aircraft, then upload or scan its identification pages and recent service records. Manual entry and Skip for now remain available.

## Identification and reference pages

A cover, original-equipment list or reference page does not need a maintenance entry. In Logbooks → Review, check its page type and any aircraft/equipment suggestions beside the scan. Pages may contain both identification information and maintenance entries.

For each suggestion, compare the current record with the proposed values. Correct any transcription errors, then accept or dismiss it. Keep the complete aircraft registration, including its country prefix (for example `N123AB`), even when an old cover omits the prefix. Select the existing equipment record when appropriate. Accepted details retain their source page; conflicting changes made elsewhere require another review.

Old equipment lists describe historical equipment. New equipment records from those lists remain historical unless you explicitly confirm that the equipment is installed today. They do not establish an installation date or complete an inspection. Mark the reference page reviewed when its suggestions are resolved; it remains in Pages without an artificial timeline event.

## Existing uploads

In aircraft setup, expand Find aircraft details in existing pages, select up to 20 pages and request reading. On iOS or Android, open a scanned page, choose Review, then Find aircraft details in this page. Reading uses the usual allowance and preserves confirmed entries and accepted/dismissed suggestions.

## Readings and engine history

Setup reuses confirmed inspection history and recorded meter readings. Their dates and sources remain important: flights after the last maintenance entry can make its reading old. Tach and Hobbs are independent, meter-face readings differ from total time after replacements, and missing values remain unknown.

Equipment Category describes the system a part belongs to. A magneto or vacuum pump can belong to the Engine category without being a complete engine. In Equipment, This record represents distinguishes complete engines, propellers and accessories. Engine history uses complete engines; historical compression readings without an unambiguous engine assignment remain visible under Unassigned observations. Readings without a recorded reference pressure require review rather than assuming a test pressure.

Mobile identity decisions can be retained offline. Sync before continuing review of that page, and resolve any reported conflicts against the current record. Viewers can inspect records but cannot accept changes.

## First-party API and native sync

Identification decisions use the replay-safe `page.details` mutation through
`POST /api/sync/v2/push`, shared with the web review action. The payload is
`{ pageId, decision }`, with the page’s original `updated_at` as the mutation `base`.

- Classify: `decision: { action: "classify", kinds: ["identity", "reference"] }`.
  Allowed kinds are `identity`, `equipment`, `maintenance`, `reference`, `blank`.
- Dismiss: `decision: { action: "dismiss", suggestionId }`.
- Accept: `decision: { action: "accept", suggestionId, fields, targetId?, targetBase?, installed? }`.
  Fields are nonblank `make`, `model`, `serial_number`, `part_number` or
  `tail_number`; aircraft details cannot include `part_number`, and equipment
  details cannot include `tail_number`. For aircraft, `targetBase` is the aircraft
  version; for existing equipment, supply its UUID and version. New equipment uses
  a stable client UUID with no `targetBase`; `installed` defaults to false.

A stale page or destination produces a conflict instead of overwriting another
reviewer’s changes. Keep the mutation ID stable on transport retries. Acceptance
updates identity and source provenance, not maintenance history or installation
dates. Follow the existing sync envelope and conflict protocol in
[mobile and sync](mobile-and-sync.md); these are not third-party OAuth endpoints.

For compression observations, service-period assignment and cost reporting, see
[the owner records API](owner-records-api.md) and
[the Engine history user guide](https://mytaillog.com/help#engine-history).

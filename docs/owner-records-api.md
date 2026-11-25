# Owner records API

These first-party endpoints accept a signed-in Supabase bearer token or the web session cookie. They are separate from the third-party `/api/v1` OAuth API. Aircraft row-level access applies throughout; maintenance editing does **not** grant access to financial records.

## Document inbox

`GET /api/aircraft/{id}/inbox` returns `items`, `logbooks`, `canEdit` and `canManageFinances`. An editor sees their own uploads; the aircraft owner can see all uploads. Viewers cannot read the inbox. Originals and proposals remain private until a reviewed non-financial destination explicitly shares them.

Upload with `POST /api/aircraft/{id}/inbox`:

- Multipart: `file` and optional UUID `id`.
- JSON: `{ "id": "UUID", "file": "base64", "fileName": "invoice.pdf", "mimeType": "application/pdf" }`.
- Alternatively supply a UUID `Idempotency-Key` header.
- PDF, JPEG, PNG and WebP, up to 25 MB. File contents must match the declared type.

The response is `{ item, duplicate? }`. Preserve the UUID and original bytes across retries. Re-uploading the same file returns the existing item; a reused identifier with different bytes is rejected.

Each item has `kind` (`unclassified`, `logbook`, `invoice`, `oil_report`), `state` (`uploaded`, `review`, `approved`, `failed`), an editable `proposal`, `updated_at`, and the retained original. `GET /inbox/{item}/file` downloads that original through the same access check.

`POST /inbox/{item}/analyze` reads the original using the user's configured AI allowance. It stages suggestions only. Failed reads can be retried with the same endpoint; overlapping reads are refused while the short processing lease is active.

For a PDF routed to a logbook, rasterize each page and stage it with `POST /inbox/{item}/pages`:

```json
{ "index": 1, "image": "base64 JPEG" }
```

The returned item's `rendered_pages` lists completed indexes. Skip those indexes on retry. Each rendered page is limited to 12 MB; PDFs may contain up to 500 pages per inbox approval. The original PDF remains intact.

Approve with `POST /inbox/{item}/approve`:

```json
{
  "base": "item.updated_at",
  "kind": "logbook",
  "logbookId": "UUID",
  "pageCount": 3
}
```

Images can be rendered server-side during logbook approval. PDF clients must stage all pages first. Approval is atomic and retry-safe. Likely duplicate pages enter the existing duplicate-review flow; extracted entries still require confirmation before affecting maintenance status.

For invoices, supply reviewed `proposal` fields from the expense schema below. Approval writes one private actual expense linked by `inbox_id`; it does not confirm maintenance or publish the invoice as a shared Document. For oil reports, supply the reviewed dated `samples` and optionally `componentId`; an identical existing sample for that engine and date is retained without duplication. Different existing measurements cause an explicit conflict and leave the upload unapproved; review and correct the existing sample before retrying. `unclassified` stores the original in shared Documents without creating maintenance entries.

## Engine history

`GET /api/aircraft/{id}/engine-history` returns:

- Engine `components`, lifecycle/measurement `events`, and `canEdit`.
- `groups`, each identified by `segmentId`, with `componentId`, `position`, `start`, `end`, compression, oil services, intervals, samples and additions.
- `unassigned` observations and `needsReview` entries.
- `sources.entries` and `sources.pages` for source selection.

Intervals end at documented component removal, overhaul, cylinder replacement or meter-reset boundaries. Historical rows attach automatically only to one documented installation interval; ambiguous twin-engine records remain unassigned.

`POST /engine-history` accepts a stable UUID `id`, `component_id`, `event_date`, `kind` (`overhaul`, `cylinder_replacement`, `compression`), optional notes/source references, and:

- Compression: `readings: [{ cylinder, psi, reference }]`. The original reference pressure is retained; values are not normalized to 80 psi.
- Cylinder replacement: `cylinders: [1, 2]`.
- Optional `meter_basis` (`tach` or `hobbs`) and nonnegative `meter_reading`.

`PATCH /engine-history/{observation}` accepts the same fields plus `base` (the original `updated_at`). `DELETE /engine-history/{observation}?base=...` removes a mistaken observation. Stale writes return 409. Source references must belong to this aircraft.

Set engine position using `POST` or `PATCH /engine-history/components/{component}/position` with `{ position, base }`.

Compression rows derived from an explicit observation include `observationId` and `sourceEntryId`. Do not treat an observation UUID as a log-entry link. A missing `sourceEntryId` means no source entry was linked.

The existing offline `oil.create` mutation also accepts optional `componentId`, validated as an engine on the same aircraft.

## Ownership costs

Only the aircraft owner can use `/api/aircraft/{id}/expenses`.

`GET` accepts optional inclusive `from` and `to` ISO dates. It returns `expenses`, separate currency `totals`, source-entry/document choices, and a disclosed usage `denominator`. Actual spending and reserves are never combined. The hourly estimate uses the widest verified meter interval within the selected dates. Confirmed, non-superseded logbook entries and manual or explicitly reviewed meter readings can supply its endpoints. The readings must use one meter, remain monotonic and not cross a reset. Equal-duration intervals prefer Hobbs. `denominator.from`/`to` disclose the actual reading dates; `rate_actual_minor` and `actual_per_hour_minor` use only actual expenses within that interval. The main currency totals and exported rows still cover the full requested period. ADS-B estimates are excluded. The source and measured interval must remain visible wherever the rate is displayed.

`POST` creates an expense using a stable UUID:

```json
{
  "id": "UUID",
  "date": "2026-03-18",
  "currency": "USD",
  "amount_minor": 12550,
  "category": "maintenance",
  "cost_type": "variable",
  "basis": "actual",
  "vendor": "Example shop",
  "payer": "Owner",
  "notes": "Oil service invoice",
  "document_id": null,
  "log_entry_id": null
}
```

Categories: `maintenance`, `fuel`, `oil`, `insurance`, `hangar`, `other`. Cost type: `fixed` or `variable`. Basis: `actual` or `reserve`. Refunds use negative amounts. Zero, fractional minor units and absolute values above 9,000,000,000,000 are refused.

Supported currencies: USD, CAD, EUR, GBP, AUD, NZD, CHF, JPY, CNY, HKD, SGD, INR, ZAR, SEK, NOK, DKK, AED, ILS, BRL, MXN, KWD, BHD and OMR. JPY has zero decimal places; KWD/BHD/OMR have three; the others have two. Currency totals are not converted.

`PATCH /expenses/{expense}` accepts the full fields plus `base`. `DELETE /expenses/{expense}?base=...` deletes an expense. A stale base returns 409, preserving the newer record.

`GET /expenses?format=csv` exports the selected period. `POST /expenses/import` accepts `{ csv }`, up to 500 rows and 2 MB. Required CSV columns are `date,currency,amount_minor,category,cost_type,basis`; optional columns match the fields above. An import validates and commits as one transaction. Exact-file retries do not duplicate rows; exported IDs preserve identity on round trips.

### Expense CSV guide and template

The public [expense import guide](https://mytaillog.com/help#expense-csv) explains every required and optional column, accepted values, currency units, examples and retry behavior. Download the [header-only CSV template](https://mytaillog.com/templates/expenses.csv), add one expense per row, and save as UTF-8 comma-separated CSV. The Costs import panel links to both.

- `category` describes the purchase: `maintenance`, `fuel`, `oil`, `insurance`, `hangar`, `other`.
- `cost_type` is `fixed` (incurred regardless of flying) or `variable` (usage-related).
- `basis` is `actual` (spending) or `reserve` (future allowance/estimate). Reserve amounts are total amounts, not automatically multiplied hourly rates.

## Annual packet and backups

`GET /api/aircraft/{id}/annual-packet?format=json|pdf` prepares the current summary. `POST` to the same endpoint with `{ format: "zip", pageIds: [], documentIds: [] }` produces the PDF plus explicitly selected evidence and its index. Foreign source IDs are rejected. There is no historical-snapshot date filter. Originals are never included by default, and the ZIP is limited to 100 MB.

Backup format 3 includes engine observations and, in owner exports, the private inbox originals and ownership ledger. Restoring creates a new aircraft, remaps references and reconnects existing destinations without reapplying extracted entries or charging invoices twice. Pending raster pages can be regenerated from the retained originals. Older backup formats remain readable.

Archive restores may pass `restoreSourceId` (the original inbox UUID) on the upload request. This aircraft-owner-only mode preserves separate source records even when their original files have identical bytes. Repeating the same restore source is idempotent; ordinary uploads continue to deduplicate by content.

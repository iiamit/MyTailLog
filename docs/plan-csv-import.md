# Plan — CSV / spreadsheet import

Bring maintenance history in from a spreadsheet or another platform's export,
without writing a parser per vendor.

This is the oldest open gap in the backlog: it surfaced while writing
`/switch/myfbo`, when the marketing agent found we accept **only PDF, JPEG and
PNG**. There is no CSV parser anywhere in the app. That page currently has to
name it as a missing feature, which is exactly the wrong answer for a page aimed
at people whose platform is shutting down.

---

## 1. The problem worth solving

Someone leaving another system has a CSV whose columns we have never seen.
`Date, Description, Tach, Mechanic` in one file; `WorkDate, Squawk, TT, A&P` in
the next. **There is no standard, so a vendor-by-vendor importer matrix is a
treadmill we should not step onto.**

The good news is we already solve a harder version of this problem: reading a
handwritten logbook page. A CSV is *easier* than a scan — it's already text, and
its structure is regular.

---

## 2. Two facts checked in the code, which decide the design

**`log_entry.page_id` is nullable** (`references page(id) on delete set null`).
An entry can exist with no scan behind it, so imported rows are representable
without inventing a fake page. `logbook_id` however is **NOT NULL** — every
imported row must be assigned to a logbook, so "which logbook is this file?" is
a required user choice, not something to infer.

**The review page deliberately excludes scan-less entries.** In
`app/aircraft/[id]/review/page.tsx`:

```ts
.eq("aircraft_id", id)
.not("page_id", "is", null)     // ← imported entries would be invisible
```

and its ordering is built entirely around pages (`pageOrder`, `thumbUrl`). So
imported entries **cannot** simply appear in the existing queue without work.
This is the integration decision the feature turns on — see §5.

---

## 3. Map the header, not the rows

The obvious approach — feed the CSV to the model and get entries back — is the
wrong one. It costs tokens proportional to file size, it's nondeterministic per
row, and a 400-row file becomes 400 chances to hallucinate a tach reading.

**Instead: one AI call that maps _columns_ to fields.** Send the header row plus
~5 sample rows; get back a proposed mapping (`"Tach Out" → tach`,
`"A&P" → signature_name`, `"Notes" → description`, `"Invoice #" → ignore`) with
a confidence per column. The user confirms or corrects that mapping **once**, and
then the mapping is applied to every row **deterministically, in plain code**.

This is better on every axis that matters:

- **One bounded call** regardless of whether the file has 20 rows or 5,000.
- **Auditable** — the transformation is code, so the same file always imports the
  same way, and a wrong import is explainable by pointing at the mapping.
- **The uncertainty lands where it belongs.** For a scan, uncertainty is per-field
  and per-entry. For a CSV the cell values are *exact*; what's uncertain is what
  the column means. Reviewing the mapping once addresses the real risk. Copying
  the per-field-confidence UI here would be theatre.

Reuse `TEXT_MODEL` (Haiku) and the existing structured-output plumbing in
`lib/extraction/`; this is a small, cheap call.

---

## 4. Dates are the data-corruption risk — do not guess

`03/04/2026` is 3 April or 4 March depending on who exported it, and **guessing
wrong silently shifts maintenance dates by up to eleven months**. Everything
downstream — annual due, 100-hour, AD compliance — is computed off those dates.

So: detect the format, and where the file is genuinely ambiguous (any day ≤ 12 in
every sampled row), **ask** rather than assume. Show the user what the first few
dates would become under each reading. An unambiguous file (ISO, or any day > 12
present) resolves itself and shouldn't prompt.

Same discipline for numbers: reject a tach that parses to something absurd rather
than importing it as `0`.

---

## 5. Where imported entries get reviewed

Imported entries must land **unconfirmed** — `owner_confirmed` gates whether an
entry drives reminders and forecasts, and data from a foreign spreadsheet has not
earned that.

**Recommendation: relax the review page's `page_id` filter and give scan-less
entries a slot**, rather than building a second review surface. Reasons:

- `ReviewAllClient` already has **bulk confirm**, which is precisely what a
  200-row import needs and what a bespoke screen would have to reimplement.
- One review queue is one place to look. Two is a place to forget.
- The work is bounded: the entries need a defined position in an ordering built
  around pages, and the layout needs to not show an empty image pane.

The alternative — import directly as confirmed — is rejected. It would let a
mis-mapped column silently drive an annual-due date.

---

## 6. Scope

**In, v1**
- **CSV only.** Not XLSX. Every spreadsheet can "Save as CSV" in one step, and
  XLSX means a new dependency and a zip/XML parser for no additional user
  outcome. Revisit only if people actually stall on it.
- **Maintenance log entries** as the single import target. It's the record type a
  migration is actually about.
- Delimiter sniffing (comma / semicolon / tab), UTF-8 with BOM, quoted fields
  containing commas and newlines.

**Out, v1 — stated so nobody has to guess**
- XLSX / Google Sheets links.
- Hours readings, ADs, squawks, equipment as import targets. The mapping
  machinery generalises to them later; adding them now multiplies the review and
  validation surface for the least valuable rows.
- Writing back out to CSV. Export already exists.
- Any vendor-specific "MyFBO importer". The whole point is not to have those.

---

## 7. Guardrails

- **Size and row caps**, enforced server-side, with a clear message rather than a
  timeout. Start at 5 MB / 5,000 rows.
- **Never import silently on top of existing data.** Show a count of what will be
  created, and afterwards point at **find-duplicates** — importing into an
  aircraft that already has entries is the obvious way to create them.
- The upload route must accept `text/csv` explicitly; the existing routes are
  restricted to PDF/JPEG/PNG and that restriction is deliberate elsewhere.
- **Import is a write** — `can_edit_aircraft`, and an e2e case proving a
  viewer-level share cannot import.
- No formula evaluation, ever. Cells are data. (The *export* side already guards
  against CSV injection; import must not undo that by round-tripping a `=` cell
  into somewhere it gets re-exported unescaped.)

---

## 8. Shape of the work

1. `lib/csv/parse.ts` — a small RFC-4180-ish parser: quotes, embedded newlines,
   BOM, delimiter sniffing. No dependency; this is well-trodden and small.
2. `lib/csv/map.ts` — the AI column-mapping call plus the **deterministic**
   row→`log_entry` transform, with date/number coercion that reports failures per
   row rather than swallowing them.
3. `/aircraft/[id]/import` — upload → proposed mapping → correct it → preview →
   import.
4. Review integration per §5.
5. `/switch/myfbo` and `/faq` updated: this stops being a missing feature.

Unit tests carry the weight here — the parser (quotes, embedded newlines,
delimiters, BOM) and the coercion (both date readings, absurd numbers, empty
cells) are pure functions and should be tested as such. An e2e drives one real
file end to end. The AI mapping call gets stubbed behind the existing
`E2E_STUB_AI` hook, and — per the ADS-B lesson — **the stub must not accept a
file the real path would reject.**

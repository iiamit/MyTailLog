# Database — schema & migrations

Schema versioning is on from day one, because bad schema decisions are expensive
to migrate once real 50-year logbook data is in it. Migrations are plain SQL in
`migrations/`, applied in filename order.

## Migrations

| File | What it adds |
|------|--------------|
| `0001_schema_v1.sql` | Core entities + RLS: `profile`, `aircraft`, `logbook`, `page`, `log_entry`, `document`, `component`. |
| `0002_storage.sql` | Private `logbook-pages` storage bucket + object-level RLS. |

## Entity map (schema v1)

```
auth.users ──1:1── profile
     │
     └─owns─► aircraft ──1:N─► logbook ──1:N─► page ──1:N─► log_entry
                 │                                              ▲
                 ├──1:N─► document                              │ install/removal
                 └──1:N─► component ────────────────────────────┘
```

- **aircraft** — top-level owned entity. `engine_serials` / `prop_serials` are
  arrays to cover single- and multi-engine without a separate table yet.
- **logbook** — `{airframe, engine, prop}`; `component_ref` splits multiple
  engine/prop books on twins.
- **page** — one scanned image (in storage) + its OCR text, confidence, and
  review status (`unreviewed` / `confirmed` / `disputed`).
- **log_entry** — structured extraction from a page. `field_confidence` (jsonb)
  carries per-field scores so the review UI flags exactly which fields are low.
  `owner_confirmed` gates whether an entry may drive a reminder (Phase 2).
- **document** — 337 / 8130-3 / STC / ICA / W&B — first-class, *not* log entries.
- **component** — part lifecycle (PN/SN, install/removal entry links, life
  limit), distinct from the free-text `log_entry.parts`.

## Data isolation (RLS)

Single-owner from day one, enforced in Postgres — not just app code:

- `aircraft` policies scope to `owner_id = auth.uid()`.
- Every child table authorizes through **`has_aircraft_access(aircraft_id)`**.
  That function is the *only* place ownership is decided, so the future
  `aircraft_share` model (read/contribute grants) and ownership transfer plug in
  by editing one function — no policy rewrite.
- Storage objects are keyed `<aircraft_id>/...` and authorized the same way.

## Applying migrations

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # apply to the linked hosted project
# or, for a full local stack:
supabase start && supabase db reset
```

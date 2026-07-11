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

Later migrations add more aircraft-scoped tables on the same RLS pattern —
`ad_compliance`/`ad_reference`, `maintenance_item`, `weight_balance`,
`scanned_document`, `equipment_proposal`, `oil_analysis_sample`, `aircraft_share`,
`mfb_connection`/`hours_reading` — plus user-scoped `ai_usage` (AI cost ledger,
service-role-written per `0032`) and `user_ai_key` (encrypted BYO Anthropic key).
Third-party secrets and BYO keys are AES-256-GCM encrypted at rest (`ENCRYPTION_KEY`).

The **OAuth provider** (`0033`/`0034`) adds `oidc_payloads` (Panva `oidc-provider`
storage — server-only, RLS-denied to clients), `oauth_client` (self-serve apps,
owner-scoped; confidential secrets encrypted in `client_secret_cipher`),
`oauth_aircraft_grant` (per-aircraft consent — the Resource Server's authz
boundary), and `oauth_access_log` (audit).

## Data isolation (RLS)

Single-owner from day one, enforced in Postgres — not just app code:

- `aircraft` policies scope to `owner_id = auth.uid()`.
- Every child table authorizes through **`has_aircraft_access(aircraft_id)`**.
  That function is the *only* place ownership is decided, so the future
  `aircraft_share` model (read/contribute grants) and ownership transfer plug in
  by editing one function — no policy rewrite.
- Storage objects are keyed `<aircraft_id>/...` and authorized the same way.
- **Exception — the OAuth Resource Server does NOT rely on RLS.** An OAuth access
  token is not a Supabase JWT, so `/api/v1` authorizes explicitly in app code
  (token → scope → aircraft ∈ `oauth_aircraft_grant`) and reads via the service
  client filtered to that aircraft. `oidc_payloads` is server-only; `oauth_client`
  / `oauth_aircraft_grant` / `oauth_access_log` keep owner-scoped RLS for the
  in-app portal + Connected-apps views.

## Applying migrations

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # apply to the linked hosted project
# or, for a full local stack:
supabase start && supabase db reset
```

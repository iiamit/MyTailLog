import type { InboxItem, Expense, EngineEvent } from "./owner/contracts";
/**
 * Hand-maintained types mirroring supabase/migrations/*.sql (schema v1).
 * Once the Supabase CLI is linked, regenerate with:
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 * Until then this keeps the app type-safe against the schema.
 */

import type { Meter } from "./hobbsTach";

export type LogbookType = "airframe" | "engine" | "prop" | "avionics" | "other";
export type ReviewStatus = "unreviewed" | "confirmed" | "disputed";
export type ExtractionStatus = "pending" | "processing" | "extracted" | "failed";
/**
 * Values 0077a added for the server-side reading queue; treat them as "being
 * read". Written by the phase 3 reader queue (0086); the v1 screens map them to
 * "processing" through v1ExtractionStatus (lib/pageStatus.ts).
 */
export type QueuedExtractionStatus = "queued" | "waiting_allowance";
/** TrustMark source (0069): read by AI, confirmed by the owner, or signed. */
export type TrustLevel = "ai_read" | "confirmed" | "signed";
export type VisitStatus = "planned" | "in_shop" | "awaiting_records" | "done" | "cancelled";
export type GapStatus = "open" | "no_pages_exist" | "asked_previous_owner" | "filled" | "dismissed";
export type AdKind = "ad" | "sb";
export type AdStatus =
  | "open"
  | "complied"
  | "previously_complied"
  | "not_applicable"
  | "superseded";
export type DocumentType =
  | "form_337"
  | "form_8130_3"
  | "stc"
  | "ica"
  | "weight_balance"
  | "airworthiness_cert"
  | "registration"
  | "radio_license"
  | "poh_afm"
  | "maintenance_manual"
  | "insurance" // 0075a
  | "other";

export type Aircraft = {
  id: string;
  owner_id: string;
  tail_number: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  year: number | null;
  engine_serials: string[];
  prop_serials: string[];
  home_base: string | null;
  enrollment_date: string;
  enrollment_hobbs: number | null;
  enrollment_tach: number | null;
  enrollment_airframe: number | null;
  notes: string | null;
  is_demo: boolean;
  // ADS-B (0048). icao24 is the cached Mode S hex; adsb_enabled is the per-
  // aircraft opt-in, off by default.
  icao24: string | null;
  adsb_enabled: boolean;
  // Direction D (0082).
  expected_hours_per_week: number | null;
  situation_override: "preparing_sale" | "in_shop" | null;
  status_ready_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One observed flight (0048). Deliberately no track data — this exists only to
 *  notice that the aircraft flew. */
export type AdsbFlight = {
  id: string;
  aircraft_id: string;
  icao24: string;
  first_seen: string;
  last_seen: string;
  est_departure_airport: string | null;
  est_arrival_airport: string | null;
  callsign: string | null;
  airborne_minutes: number;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Logbook = {
  id: string;
  aircraft_id: string;
  type: LogbookType;
  component_ref: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export type Page = {
  id: string;
  logbook_id: string;
  aircraft_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  page_sequence: number | null;
  captured_at: string | null;
  ocr_text: string | null;
  extraction_confidence: number | null;
  review_status: ReviewStatus;
  is_handwritten: boolean | null;
  extraction_status: ExtractionStatus | QueuedExtractionStatus;
  extraction_error: string | null;
  detected_page_count: number | null;
  /**
   * Rotated content was visible but not fully read, even after the follow-up
   * pass (0052). Review warns on it — a missed entry has nothing to review
   * against, so a visible flag is the only recoverable outcome.
   */
  unread_rotated_content: boolean;
  extracted_at: string | null;
  // Scan batches, duplicate detection, map placement (0077b).
  batch_id: string | null;
  image_phash: string | null;
  duplicate_of_page_id: string | null;
  needs_look: boolean | null;
  landing_date: string | null;
  // Reader worker bookkeeping (0086): who pays the allowance, tries, when to retry.
  queued_by: string | null;
  read_attempts: number;
  read_after: string | null;
  created_at: string;
  updated_at: string;
}

/** The v2 push ledger and conflict record (0086). */
export type SyncMutation = {
  user_id: string;
  id: string;
  aircraft_id: string | null;
  type: string;
  status: "ok" | "conflict" | "error";
  base: string | null;
  error: string | null;
  code: string | null;
  resolution: "keep_mine" | "keep_both" | "take_theirs" | "discard" | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  response: unknown | null;
  request: unknown | null;
};

export type LogEntry = {
  id: string;
  page_id: string | null;
  logbook_id: string;
  aircraft_id: string;
  entry_date: string | null;
  hobbs: number | null;
  tach: number | null;
  airframe: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[];
  sb_refs: string[];
  confidence: number | null;
  field_confidence: Record<string, number> | null;
  field_boxes: Record<string, { x: number; y: number; w: number; h: number } | null> | null;
  extraction_schema_version: number;
  extraction_model: string | null;
  owner_confirmed: boolean;
  hours_reviewed_at: string | null;
  entry_index: number | null;
  continues_next: boolean;
  is_continuation: boolean;
  reference_links: ReferenceLink[]; // external references (STC/AC/AD pages) — 0041
  authored_by: string | null;
  authored_signed_at: string | null;
  authored_cert_kind: string | null;
  authored_cert_rating: string | null;
  authored_template_id: string | null;
  authored_template_version: number | null;
  authored_answers: Record<string, string> | null;
  authored_payload: Record<string, unknown> | null;
  authored_digest: string | null;
  supersedes_entry_id: string | null;
  authored_superseded_by: string | null;
  // 0069. `trust` is generated by the database; never write it.
  trust: TrustLevel;
  replaced_by_entry_id: string | null;
  stated_times: { component: "engine" | "prop"; basis: "SMOH" | "SPOH" | "TSO" | "TT"; value: number }[] | null;
  entry_kind: string | null;
  created_at: string;
  updated_at: string;
}

export type RecordRoom = {
  id: string;
  aircraft_id: string;
  created_by: string;
  label: string;
  token_hash: string;
  token_enc: string;
  include_summary: boolean;
  logbook_ids: string[];
  include_scans: boolean;
  document_ids: string[];
  expires_at: string;
  revoked_at: string | null;
  // 0080
  audience: "ia" | "buyer" | "insurer" | "other";
  cover: "map" | "summary";
  map_window: "whole_life" | "line_ahead" | "last_5_years";
  include_dossier: boolean;
  include_squawks: boolean;
  include_reporters: boolean;
  include_gaps_note: boolean;
  created_at: string;
};

export type RecordRoomView = {
  id: number;
  room_id: string;
  path: string;
  ip_hash: string | null;
  user_agent: string | null;
  session_key: string | null; // 0080
  section: string | null;
  created_at: string;
};

/** View record_room_opens (0080): one row per browser session. */
export type RecordRoomOpen = {
  room_id: string;
  session_key: string | null;
  opened_at: string;
  last_at: string;
  sections: string[] | null;
};

export type DocumentRecord = {
  id: string;
  aircraft_id: string;
  type: DocumentType;
  title: string | null;
  storage_path: string | null;
  document_date: string | null;
  reference: string | null;
  notes: string | null;
  log_entry_id: string | null; // set → attached to a maintenance entry (0041)
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  // Expiry on the due list (0075b).
  expires_on: string | null;
  renews_every_months: number | null;
  track_expiry: boolean;
  remind_lead_days: number | null;
  created_at: string;
  updated_at: string;
}

/** A free-text external reference on a log entry (STC/AC/AD page, etc). */
export type ReferenceLink = { label: string; url: string };

export type Component = {
  position?: string | null;
  id: string;
  aircraft_id: string;
  name: string;
  make: string | null;
  category: string | null;
  part_number: string | null;
  serial_number: string | null;
  install_entry_id: string | null;
  install_date: string | null;
  removal_entry_id: string | null;
  removal_date: string | null;
  life_limit_value: number | null;
  life_limit_unit: "hours" | "months" | "cycles" | null;
  is_installed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AdCompliance = {
  id: string;
  aircraft_id: string;
  kind: AdKind;
  reference: string;
  title: string | null;
  applicability: string | null;
  recurring: boolean;
  interval_hours: number | null;
  interval_months: number | null;
  status: AdStatus;
  method: string | null;
  complied_date: string | null;
  complied_hours: number | null;
  next_due_date: string | null;
  next_due_hours: number | null;
  reference_entry_id: string | null;
  notes: string | null;
  ad_reference_id: string | null;
  component_id: string | null;
  reason: string | null;
  status_changed_on: string | null;
  // Set when this AD is corroborated by a scanned A&P compliance report.
  verified_report_page_id: string | null;
  verified_at: string | null;
  provider_id: string | null; // 0072
  created_at: string;
  updated_at: string;
}

export type AdReference = {
  id: string;
  ad_number: string | null;
  fr_document_number: string | null;
  title: string | null;
  abstract: string | null;
  effective_date: string | null;
  fr_html_url: string | null;
  pdf_url: string | null;
  full_text_url: string | null;
  citation: string | null;
  rin: string | null;
  supersedes: string | null;
  source: string;
  drs_url: string | null;
  drs_doc_id: string | null;
  document_status: string | null;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

// Public AD catalog (0067) — Federal Register ADs with parsed makes/models.
export type AdCatalog = {
  ad_number: string;
  title: string;
  abstract: string | null;
  effective_date: string | null;
  makes: string[];
  models: string[];
  fr_html_url: string | null;
  pdf_url: string | null;
  citation: string | null;
  source: string;
  updated_at: string;
}

export type AdCatalogModel = {
  make: string;
  model: string;
  ad_count: number;
  latest_effective_date: string | null;
}

export type EquipmentProposal = {
  id: string;
  aircraft_id: string;
  page_id: string | null;
  name: string;
  make: string | null;
  category: string | null;
  part_number: string | null;
  serial_number: string | null;
  install_date: string | null;
  removal_date: string | null;
  is_installed: boolean;
  action: string | null;
  confidence: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export type MaintenanceItem = {
  id: string;
  aircraft_id: string;
  kind: string;
  label: string;
  regulatory: boolean;
  interval_months: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  last_done_hours: number | null;
  next_due_date: string | null;
  next_due_hours: number | null;
  notes: string | null;
  /** Meter this item's hours count down on. null = default (oil → hobbs, else tach). */
  meter: Meter | null;
  // Direction D (0071).
  line: LogbookType | null;
  shop_kind: ShopKind | "self" | null;
  provider_id: string | null;
  ifr_only: boolean;
  expires_on: string | null;
  visit_window_days: number | null;
  visit_window_hours: number | null;
  remind_lead_days: number | null;
  remind_lead_hours: number | null;
  created_at: string;
  updated_at: string;
}

export type ShopKind = "mechanic" | "avionics_shop" | "prop_shop" | "engine_shop";

/** One completion of a tracked item or AD (0070). Exactly one parent is set. */
export type ItemCompletion = {
  id: string;
  aircraft_id: string;
  maintenance_item_id: string | null;
  ad_compliance_id: string | null;
  log_entry_id: string | null;
  done_date: string;
  done_hours: number | null;
  meter: Meter | null;
  source: "mark_done" | "extraction" | "owner_link" | "import" | "vor_check" | "visit";
  visit_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ServiceProvider = {
  id: string;
  aircraft_id: string;
  name: string;
  kind: ShopKind;
  cert_number: string | null;
  airport: string | null;
  email: string | null;
  phone: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type PlannedVisit = {
  id: string;
  aircraft_id: string;
  status: VisitStatus;
  week_of: string; // a Monday
  visit_date: string | null;
  provider_id: string | null;
  airport: string | null;
  notes: string | null;
  from_suggestion_key: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PlannedVisitItem = {
  id: string;
  aircraft_id: string;
  visit_id: string;
  item_key: string; // 'mx:<uuid>' | 'ad:<uuid>' | 'squawk:<uuid>'
  done_completion_id: string | null;
  created_at: string;
  updated_at: string;
}

export type VisitSuggestionDismissal = {
  id: string;
  aircraft_id: string;
  suggestion_key: string;
  dismissed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type LogbookGap = {
  id: string;
  aircraft_id: string;
  logbook_id: string;
  from_date: string;
  to_date: string;
  status: GapStatus;
  source: "coverage_rule" | "annual_chain" | "owner";
  note: string | null;
  status_set_by: string | null;
  status_set_at: string | null;
  detected_at: string;
  created_at: string;
  updated_at: string;
}

export type SquawkPhoto = {
  id: string;
  aircraft_id: string;
  squawk_id: string;
  storage_path: string;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Account-free squawk or visit link for a mechanic (0076). Online only. */
export type MechanicLink = {
  id: string;
  aircraft_id: string;
  kind: "squawk" | "visit";
  squawk_ids: string[];
  visit_id: string | null;
  recipient_label: string;
  provider_id: string | null;
  token_hash: string;
  token_enc: string;
  include_photos: boolean;
  include_reporter: boolean;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
}

export type MechanicLinkView = {
  id: number;
  link_id: string;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
}

export type ScanBatch = {
  id: string;
  aircraft_id: string;
  logbook_id: string;
  source: "phone_camera" | "web_upload" | "web_camera" | "pdf" | "csv";
  expected_pages: number;
  is_handwritten: boolean;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  notified_at: string | null;
  updated_at: string;
}

export type TimeCheckDismissal = {
  id: string;
  aircraft_id: string;
  component: "engine" | "prop";
  log_entry_id: string;
  written_value: number;
  calculated_value: number;
  action: "agree" | "added_to_annual_prep";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Server-computed status (0083); `snapshot` is StatusSnapshot (09 §4.3). */
export type AircraftStatusSnapshot = {
  aircraft_id: string;
  id: string;
  computed_at: string;
  inputs_seq: number;
  algo_version: number;
  snapshot: Record<string, unknown>;
  updated_at: string;
}

export type SyncRetention = {
  id: boolean;
  min_seq_retained: number;
  updated_at: string;
}

/**
 * A meter that was replaced and restarted (0046). Hobbs and tach both get swapped
 * over an aircraft's life; without this the app can't tell a replacement from a
 * mis-keyed reading, and pre-replacement history breaks every hour countdown.
 */
export type MeterResetRow = {
  id: string;
  aircraft_id: string;
  meter: Meter;
  reset_date: string;
  prior_value: number | null;
  new_value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type WeightBalance = {
  id: string;
  aircraft_id: string;
  revision_date: string;
  empty_weight: number | null;
  empty_weight_arm: number | null;
  empty_weight_moment: number | null;
  max_gross_weight: number | null;
  method: "weighed" | "computed" | null;
  reference: string | null;
  reason: string | null;
  notes: string | null;
  // The scanned page this revision was derived from ("view source"), if any.
  source_page_id: string | null;
  created_at: string;
  updated_at: string;
}

export type SquawkSeverity = "low" | "medium" | "high";
export type SquawkStatus = "open" | "resolved";

/** A pilot-reported discrepancy, tracked open → resolved (0043). */
export type Squawk = {
  id: string;
  aircraft_id: string;
  description: string;
  severity: SquawkSeverity;
  status: SquawkStatus;
  reported_by: string | null;
  reporter_name: string | null;
  reported_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_log_entry_id: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

// Append-only change feed for the offline sync engine (migration 0044).
export type ChangeLog = {
  seq: number;
  table_name: string;
  row_id: string;
  op: "I" | "U" | "D";
  aircraft_id: string;
  changed_at: string;
};

export type ScannedDocumentType = "weight_balance" | "ad_report" | "other";

export type ScannedDocument = {
  id: string;
  aircraft_id: string;
  page_id: string;
  doc_type: ScannedDocumentType;
  document_date: string | null;
  extracted: Record<string, unknown>;
  summary: string | null;
  applied: boolean;
  confidence: number | null;
  created_at: string;
  updated_at: string;
}

export type ShareRole = "viewer" | "editor";

export type Preferences = {
  /** Master switch for reminder emails. When false, no emails are ever sent. */
  notify_due?: boolean;
  /**
   * Per-category alert lead times (how far in advance to email). Any missing
   * field falls back to ALERT_DEFAULTS in @/lib/reminders. The oil-change
   * *interval* is set on the maintenance item, not here.
   */
  alerts?: {
    annual?: { enabled: boolean; lead_days: number };
    oil?: { enabled: boolean; lead_hours: number };
    ad?: { enabled: boolean; lead_days: number; lead_hours: number };
    default?: { enabled: boolean; lead_days: number; lead_hours: number };
  };
};

export type Profile = {
  id: string;
  full_name: string | null;
  cert_number: string | null;
  email: string | null;
  is_admin: boolean;
  preferences: Preferences;
  onboarding_opt_out: boolean;
  onboarding_unsubscribe_token: string;
  /** First-touch attribution (0066); service-role writes only. */
  signup_source: { ref?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string; referrer_host?: string; landing: string; at: string } | null;
  /** "How did you hear" answer (0066 check list). */
  heard_about: string | null;
  /** IANA zone captured from the browser or phone (0079); null = UTC. */
  time_zone: string | null;
  created_at: string;
  updated_at: string;
}

export type SigningCredential = {
  id: string;
  user_id: string;
  kind: "private_pilot" | "commercial_pilot" | "airline_transport_pilot" | "sport_pilot" | "mechanic";
  certificate_number: string;
  rating: string | null;
  created_at: string;
};

export type EntrySigningChallenge = {
  id: string; user_id: string; request: Record<string, unknown>; code_hash: string;
  signer_name: string; cert_kind: string; cert_number: string; cert_rating: string | null;
  expires_at: string; attempts: number; consumed_at: string | null; created_at: string;
};

export type AdminUserStat = {
  id: string;
  email: string | null;
  is_admin: boolean;
  joined: string;
  aircraft: number;
  logbooks: number;
  pages: number;
  entries: number;
  last_entry_at: string | null;
}

export type AdminGrowthFunnel = {
  signed_up: number;
  added_aircraft: number;
  uploaded_pages: number;
  reviewed_pages: number;
  shared_summary: number;
  status_ready: number;
}

export type AdminSignupsBySource = {
  source: string;
  signed_up: number;
  added_aircraft: number;
  uploaded_pages: number;
  status_ready: number;
  last_7d: number;
}

export type GrowthEvent = {
  user_id: string;
  event: "summary_shared" | "summary_exported";
  created_at: string;
}

export type AircraftShare = {
  id: string;
  aircraft_id: string;
  invited_email: string;
  role: ShareRole;
  invited_by: string;
  created_at: string;
}

/**
 * Per-user MyFlightBook OAuth app credentials + tokens. client_secret and the
 * tokens are SENSITIVE — only ever read server-side, never returned to the
 * browser (the profile UI shows connection state + a masked hint at most).
 */
export type MfbConnection = {
  id: string;
  user_id: string;
  client_id: string | null;
  client_secret: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  mfb_username: string | null;
  connected_at: string | null;
  // Last time the daily cron auto-synced this connection (once/day throttle).
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One oil-analysis lab sample (Blackstone/AVLab/etc.), imported from a report. */
/** An owner's "added N quarts" top-off between oil changes (0042). */
export type OilAddition = {
  id: string;
  aircraft_id: string;
  component_id: string | null;
  added_date: string;
  quarts: number;
  hobbs: number | null;
  tach: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type OilAnalysisSample = {
  source_inbox_id?: string | null;
  id: string;
  aircraft_id: string;
  component_id: string | null;
  sample_date: string;
  analysis_date: string | null;
  lab: string | null;
  lab_number: string | null;
  sample_number: string | null;
  oil_type: string | null;
  oil_hours: number | null;
  engine_hours: number | null;
  oil_added_quarts: number | null;
  elements_ppm: Record<string, number>;
  oil_properties: Record<string, number> | null;
  universal_averages: Record<string, number> | null;
  lab_comments: string | null;
  status: string | null;
  notes: string | null;
  excluded_from_averages: boolean;
  source_page_id: string | null;
  created_at: string;
  updated_at: string;
}

/** One Anthropic model call — rate-limit source + BYOK usage/cost ledger. */
export type AiUsage = {
  id: string;
  user_id: string;
  route: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  used_own_key: boolean;
  provider: "anthropic" | "openai";
  created_at: string;
}

export type AppSetting = { key: string; value: string; updated_at: string };

/** A user's own AI API key, encrypted at rest. */
export type UserAiKey = {
  user_id: string;
  key_cipher: string;
  key_last4: string | null;
  created_at: string;
  updated_at: string;
}

/** Panva oidc-provider adapter storage (server-only). */
export type OidcPayload = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  grant_id: string | null;
  user_code: string | null;
  uid: string | null;
  expires_at: string | null;
  consumed_at: string | null;
}

/** A self-serve registered third-party OAuth client (developer portal). */
export type OauthClient = {
  client_id: string;
  client_secret_cipher: string | null; // AES-GCM ciphertext (confidential clients)
  name: string;
  redirect_uris: string[];
  scopes: string[];
  is_confidential: boolean;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

/** A user's per-aircraft consent for a client (the Resource Server authorizes here). */
export type OauthAircraftGrant = {
  id: string;
  account_id: string;
  client_id: string;
  aircraft_id: string;
  scopes: string[];
  created_at: string;
  revoked_at: string | null;
}

/** Account-wide grant: a client may access ALL aircraft the account owns (0040). */
export type OauthAccountGrant = {
  id: string;
  account_id: string;
  client_id: string;
  scopes: string[];
  created_at: string;
  revoked_at: string | null;
}

/** Audit row: which client called which aircraft/scope, and whether it was served. */
export type OauthAccessLog = {
  id: string;
  client_id: string | null;
  account_id: string | null;
  aircraft_id: string | null;
  scope: string | null;
  path: string | null;
  /** 200 = served; 4xx = denied by guard(). Defaults to 200 (0051). */
  status: number;
  /** OAuth error code on a denial; null when served. Never a token (0051). */
  error: string | null;
  created_at: string;
}

/** One reminder email sent for an item's current due-cycle (dedup key). */
export type ReminderLog = {
  id: string;
  user_id: string;
  aircraft_id: string;
  item_key: string;
  due_signature: string;
  sent_at: string;
  // 0079
  kind: ReminderKind;
  channel: "email" | "push" | "in_app";
  visit_id: string | null;
  // 0091: weekly sends are numbered 1..8 within a due cycle; other kinds use 1.
  nth: number;
}

export type ReminderKind = "lead" | "lapse" | "weekly" | "visit" | "visit_risk" | "document" | "reading_done" | "gap";

export type ReminderSnooze = {
  id: string;
  user_id: string;
  aircraft_id: string;
  item_key: string;
  due_signature: string;
  until_at: string | null; // null = for this due cycle
  created_at: string;
}

/** In-app inbox row (0079). Named to avoid the DOM's Notification. */
export type AppNotification = {
  id: string;
  user_id: string;
  aircraft_id: string | null;
  kind: string;
  title: string;
  body: string;
  deep_link: string;
  actions: { id: string; label: string }[];
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
}

export type OnboardingEmailCandidate = {
  user_id: string;
  email: string;
  full_name: string | null;
  unsubscribe_token: string;
  stage: "aircraft" | "logbooks" | "extract" | "review" | "success";
  is_catchup: boolean;
  aircraft_id: string | null;
  tail_number: string | null;
};

export type OnboardingEmailLog = {
  id: string;
  user_id: string;
  stage: OnboardingEmailCandidate["stage"];
  is_catchup: boolean;
  claimed_at: string;
  sent_at: string | null;
};

/** Scheduled cloud backups (0049). The DESTINATION (with its OAuth tokens)
 *  deliberately has no type here — it lives in the private schema. */
export type BackupSchedule = {
  id: string;
  user_id: string;
  destination_id: string | null;
  aircraft_id: string | null; // null ⇒ all the user's aircraft
  frequency: "off" | "monthly" | "quarterly";
  day_of_month: number;
  next_run_at: string | null;
  last_run_at: string | null;
  claimed_at: string | null;
  consecutive_failures: number;
  created_at: string;
}

/** One device that may receive a push (0059). Keyed on the token, not the user. */
export type DeviceToken = {
  token: string;
  user_id: string;
  platform: string;
  created_at: string;
};

export type BackupRun = {
  id: string;
  schedule_id: string;
  user_id: string;
  aircraft_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "failed" | "skipped_too_large";
  bytes: number | null;
  remote_path: string | null;
  /** Redacted of anything token-shaped before it's stored — it's readable here. */
  error: string | null;
}

/** Latest recorded hobbs/tach for an aircraft, e.g. synced from MyFlightBook. */
export type HoursReading = {
  id: string;
  aircraft_id: string;
  reading_date: string | null;
  hobbs: number | null;
  tach: number | null;
  airframe: number | null;
  source: string;
  synced_by: string | null;
  external_ref: string | null;
  hours_reviewed_at: string | null;
  // Tach photo reading (0078); source 'tach_photo'.
  photo_path: string | null;
  ocr_value: number | null;
  ocr_confidence: number | null;
  ocr_candidates: { value: number; confidence: number; bbox: [number, number, number, number] }[] | null;
  owner_edited: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Database shape for @supabase/ssr generic typing. Tables are written as
 * concrete inline Row/Insert/Update triples (not via a generic wrapper) —
 * Supabase's type utilities deep-index this shape and a generic alias wrapper
 * degrades to `never` during that indexing.
 */
export type Database = {
  public: {
    Tables: {
      announcement: { Row: { id: string; title: string; body: string; link_path: string | null; published_at: string; expires_at: string | null; created_at: string }; Insert: { title: string; body: string; link_path?: string | null; expires_at?: string | null }; Update: Partial<{ title: string; body: string; link_path: string | null; expires_at: string | null }>; Relationships: [] };
      announcement_dismissal: { Row: { announcement_id: string; user_id: string; dismissed_at: string }; Insert: { announcement_id: string; user_id: string }; Update: never; Relationships: [] };
      profile: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile>; Relationships: [] };
      signing_credential: { Row: SigningCredential; Insert: Partial<SigningCredential>; Update: Partial<SigningCredential>; Relationships: [] };
      entry_signing_challenge: { Row: EntrySigningChallenge; Insert: Partial<EntrySigningChallenge>; Update: Partial<EntrySigningChallenge>; Relationships: [] };
      aircraft: { Row: Aircraft; Insert: Partial<Aircraft>; Update: Partial<Aircraft>; Relationships: [] };
      logbook: { Row: Logbook; Insert: Partial<Logbook>; Update: Partial<Logbook>; Relationships: [] };
      page: { Row: Page; Insert: Partial<Page>; Update: Partial<Page>; Relationships: [] };
      log_entry: { Row: LogEntry; Insert: Partial<LogEntry>; Update: Partial<LogEntry>; Relationships: [] };
      signed_entry_scan: { Row: { page_id: string; entry_id: string; aircraft_id: string; created_at: string }; Insert: { page_id: string; entry_id: string; aircraft_id: string }; Update: never; Relationships: [] };
      aircraft_inbox: { Row: InboxItem; Insert: Partial<InboxItem>; Update: Partial<InboxItem>; Relationships: [] };
      aircraft_expense: { Row: Expense; Insert: Partial<Expense>; Update: Partial<Expense>; Relationships: [] };
      engine_observation: { Row: EngineEvent; Insert: Partial<EngineEvent>; Update: Partial<EngineEvent>; Relationships: [] };
      document: { Row: DocumentRecord; Insert: Partial<DocumentRecord>; Update: Partial<DocumentRecord>; Relationships: [] };
      record_room: { Row: RecordRoom; Insert: Partial<RecordRoom> & Pick<RecordRoom, "aircraft_id" | "created_by" | "label" | "token_hash" | "token_enc" | "expires_at">; Update: Partial<RecordRoom>; Relationships: [] };
      record_room_view: { Row: RecordRoomView; Insert: Partial<RecordRoomView> & Pick<RecordRoomView, "room_id" | "path">; Update: never; Relationships: [] };
      component: { Row: Component; Insert: Partial<Component>; Update: Partial<Component>; Relationships: [] };
      ad_compliance: { Row: AdCompliance; Insert: Partial<AdCompliance>; Update: Partial<AdCompliance>; Relationships: [] };
      ad_reference: { Row: AdReference; Insert: Partial<AdReference>; Update: Partial<AdReference>; Relationships: [] };
      ad_catalog: { Row: AdCatalog; Insert: Partial<AdCatalog> & Pick<AdCatalog, "ad_number" | "title">; Update: Partial<AdCatalog>; Relationships: [] };
      equipment_proposal: { Row: EquipmentProposal; Insert: Partial<EquipmentProposal>; Update: Partial<EquipmentProposal>; Relationships: [] };
      maintenance_item: { Row: MaintenanceItem; Insert: Partial<MaintenanceItem>; Update: Partial<MaintenanceItem>; Relationships: [] };
      meter_reset: { Row: MeterResetRow; Insert: Partial<MeterResetRow>; Update: Partial<MeterResetRow>; Relationships: [] };
      aircraft_share: { Row: AircraftShare; Insert: Partial<AircraftShare>; Update: Partial<AircraftShare>; Relationships: [] };
      weight_balance: { Row: WeightBalance; Insert: Partial<WeightBalance>; Update: Partial<WeightBalance>; Relationships: [] };
      scanned_document: { Row: ScannedDocument; Insert: Partial<ScannedDocument>; Update: Partial<ScannedDocument>; Relationships: [] };
      // mfb_connection lives in a private schema (0047) — not exposed to PostgREST;
      // reached only via the mfb SECURITY DEFINER functions below.
      hours_reading: { Row: HoursReading; Insert: Partial<HoursReading>; Update: Partial<HoursReading>; Relationships: [] };
      ai_usage: { Row: AiUsage; Insert: Partial<AiUsage>; Update: Partial<AiUsage>; Relationships: [] };
      app_setting: { Row: AppSetting; Insert: Partial<AppSetting>; Update: Partial<AppSetting>; Relationships: [] };
      // user_ai_key lives in a private schema (0039) — not exposed to PostgREST;
      // reached only via the ai-key SECURITY DEFINER functions below.
      oil_analysis_sample: { Row: OilAnalysisSample; Insert: Partial<OilAnalysisSample>; Update: Partial<OilAnalysisSample>; Relationships: [] };
      oil_addition: { Row: OilAddition; Insert: Partial<OilAddition>; Update: Partial<OilAddition>; Relationships: [] };
      squawk: { Row: Squawk; Insert: Partial<Squawk>; Update: Partial<Squawk>; Relationships: [] };
      adsb_flight: { Row: AdsbFlight; Insert: Partial<AdsbFlight>; Update: Partial<AdsbFlight>; Relationships: [] };
      change_log: { Row: ChangeLog; Insert: Partial<ChangeLog>; Update: Partial<ChangeLog>; Relationships: [] };
      oidc_payloads: { Row: OidcPayload; Insert: Partial<OidcPayload>; Update: Partial<OidcPayload>; Relationships: [] };
      oauth_client: { Row: OauthClient; Insert: Partial<OauthClient>; Update: Partial<OauthClient>; Relationships: [] };
      oauth_aircraft_grant: { Row: OauthAircraftGrant; Insert: Partial<OauthAircraftGrant>; Update: Partial<OauthAircraftGrant>; Relationships: [] };
      oauth_account_grant: { Row: OauthAccountGrant; Insert: Partial<OauthAccountGrant>; Update: Partial<OauthAccountGrant>; Relationships: [] };
      oauth_access_log: { Row: OauthAccessLog; Insert: Partial<OauthAccessLog>; Update: Partial<OauthAccessLog>; Relationships: [] };
      reminder_log: { Row: ReminderLog; Insert: Partial<ReminderLog>; Update: Partial<ReminderLog>; Relationships: [] };
      onboarding_email_log: { Row: OnboardingEmailLog; Insert: Partial<OnboardingEmailLog>; Update: Partial<OnboardingEmailLog>; Relationships: [] };
      growth_event: { Row: GrowthEvent; Insert: Partial<GrowthEvent>; Update: Partial<GrowthEvent>; Relationships: [] };
      // backup_destination lives in a private schema (0049) — not exposed to
      // PostgREST; reached only via the backup SECURITY DEFINER functions below.
      backup_schedule: { Row: BackupSchedule; Insert: Partial<BackupSchedule>; Update: Partial<BackupSchedule>; Relationships: [] };
      backup_run: { Row: BackupRun; Insert: Partial<BackupRun>; Update: Partial<BackupRun>; Relationships: [] };
      device_token: { Row: DeviceToken; Insert: Partial<DeviceToken>; Update: Partial<DeviceToken>; Relationships: [] };
      // Direction D (0070–0084).
      item_completion: { Row: ItemCompletion; Insert: Partial<ItemCompletion> & Pick<ItemCompletion, "aircraft_id" | "done_date" | "source">; Update: Partial<ItemCompletion>; Relationships: [] };
      service_provider: { Row: ServiceProvider; Insert: Partial<ServiceProvider> & Pick<ServiceProvider, "aircraft_id" | "name" | "kind">; Update: Partial<ServiceProvider>; Relationships: [] };
      planned_visit: { Row: PlannedVisit; Insert: Partial<PlannedVisit> & Pick<PlannedVisit, "aircraft_id" | "week_of">; Update: Partial<PlannedVisit>; Relationships: [] };
      planned_visit_item: { Row: PlannedVisitItem; Insert: Partial<PlannedVisitItem> & Pick<PlannedVisitItem, "aircraft_id" | "visit_id" | "item_key">; Update: Partial<PlannedVisitItem>; Relationships: [] };
      visit_suggestion_dismissal: { Row: VisitSuggestionDismissal; Insert: Partial<VisitSuggestionDismissal> & Pick<VisitSuggestionDismissal, "aircraft_id" | "suggestion_key">; Update: Partial<VisitSuggestionDismissal>; Relationships: [] };
      logbook_gap: { Row: LogbookGap; Insert: Partial<LogbookGap> & Pick<LogbookGap, "aircraft_id" | "logbook_id" | "from_date" | "to_date">; Update: Partial<LogbookGap>; Relationships: [] };
      squawk_photo: { Row: SquawkPhoto; Insert: Partial<SquawkPhoto> & Pick<SquawkPhoto, "aircraft_id" | "squawk_id" | "storage_path">; Update: Partial<SquawkPhoto>; Relationships: [] };
      mechanic_link: { Row: MechanicLink; Insert: Partial<MechanicLink> & Pick<MechanicLink, "aircraft_id" | "kind" | "recipient_label" | "token_hash" | "token_enc" | "expires_at" | "created_by">; Update: Partial<MechanicLink>; Relationships: [] };
      mechanic_link_view: { Row: MechanicLinkView; Insert: Partial<MechanicLinkView> & Pick<MechanicLinkView, "link_id">; Update: never; Relationships: [] };
      scan_batch: { Row: ScanBatch; Insert: Partial<ScanBatch> & Pick<ScanBatch, "aircraft_id" | "logbook_id" | "source" | "expected_pages">; Update: Partial<ScanBatch>; Relationships: [] };
      reminder_snooze: { Row: ReminderSnooze; Insert: Partial<ReminderSnooze> & Pick<ReminderSnooze, "user_id" | "aircraft_id" | "item_key" | "due_signature">; Update: Partial<ReminderSnooze>; Relationships: [] };
      notification: { Row: AppNotification; Insert: Partial<AppNotification> & Pick<AppNotification, "user_id" | "kind" | "title" | "body" | "deep_link">; Update: Partial<AppNotification>; Relationships: [] };
      time_check_dismissal: { Row: TimeCheckDismissal; Insert: Partial<TimeCheckDismissal> & Pick<TimeCheckDismissal, "aircraft_id" | "component" | "log_entry_id" | "written_value" | "calculated_value" | "action">; Update: Partial<TimeCheckDismissal>; Relationships: [] };
      aircraft_status_snapshot: { Row: AircraftStatusSnapshot; Insert: Partial<AircraftStatusSnapshot> & Pick<AircraftStatusSnapshot, "aircraft_id" | "computed_at" | "inputs_seq" | "algo_version" | "snapshot">; Update: Partial<AircraftStatusSnapshot>; Relationships: [] };
      sync_retention: { Row: SyncRetention; Insert: Partial<SyncRetention>; Update: Partial<SyncRetention>; Relationships: [] };
      sync_mutation: { Row: SyncMutation; Insert: Partial<SyncMutation> & Pick<SyncMutation, "user_id" | "id" | "type" | "status">; Update: Partial<SyncMutation>; Relationships: [] };
    };
    Views: {
      admin_user_stats: { Row: AdminUserStat; Relationships: [] };
      admin_growth_funnel: { Row: AdminGrowthFunnel; Relationships: [] };
      admin_signups_by_source: { Row: AdminSignupsBySource; Relationships: [] };
      ad_catalog_model: { Row: AdCatalogModel; Relationships: [] };
      record_room_opens: { Row: RecordRoomOpen; Relationships: [] };
    };
    Functions: {
      record_ad_compliance: { Args: { p_aircraft: string; p_ad: string; p_base: string; p_date: string; p_hours: number | null; p_entry: string | null; p_method: string | null }; Returns: unknown };
      confirm_review_entries: { Args: { p_aircraft: string; p_page: string | null; p_book: string | null; p_page_base: string | null; p_writes: Record<string, unknown>[]; p_whole: boolean }; Returns: unknown };
      undo_review_confirmation: { Args: { p_aircraft: string; p_entries: Record<string, string>; p_pages: Record<string, string> }; Returns: unknown };

      create_squawk: { Args: { p_aircraft: string; p_fields: Record<string, unknown>; p_photos: string[] }; Returns: unknown };
      confirm_clean_entries: { Args: { p_aircraft: string; p_versions: Record<string, string> }; Returns: unknown };
      create_planned_visit: { Args: { p_aircraft: string; p_visit: Record<string, unknown>; p_keys: string[] }; Returns: unknown };
      seed_maintenance_items: { Args: { p_aircraft: string; p_items: Record<string, unknown>[] }; Returns: unknown };
      insert_records: { Args: { p_table: string; p_aircraft: string; p_rows: Record<string, unknown>[]; p_conflict: string; p_ignore: boolean }; Returns: unknown };
      retire_component: { Args: { p_aircraft: string; p_id: string; p_base: string; p_date: string; p_entry: string | null }; Returns: unknown };
      confirm_equipment_proposals: { Args: { p_aircraft: string; p_ids: string[]; p_dismiss: boolean }; Returns: unknown };
      change_pages: { Args: { p_aircraft: string; p_ids: string[]; p_action: string; p_book: string | null }; Returns: unknown };

      apply_sync_write: { Args: { p_mutation: Record<string, unknown>; p_operation: string; p_arguments: Record<string, unknown> }; Returns: unknown };
      record_sync_result: { Args: { p_mutation: Record<string, unknown>; p_result: Record<string, unknown>; p_resolution: string | null }; Returns: unknown };
      mark_maintenance_done: { Args: { p_aircraft: string; p_item: string; p_base: string; p_patch: Record<string, unknown>; p_reading: Record<string, unknown> | null; p_entry: Record<string, unknown> | null; p_completion?: Record<string, unknown> | null }; Returns: unknown };
      save_service_provider: { Args: { p_aircraft: string; p_id: string; p_base: string | null; p_fields: Record<string, unknown> }; Returns: unknown };
      save_planned_visit: { Args: { p_aircraft: string; p_visit: string; p_base: string; p_patch: Record<string, unknown>; p_add: string[]; p_remove: string[] }; Returns: unknown };
      set_expected_hours_checked: { Args: { target_aircraft: string; hours_per_week: number | null; p_base: string }; Returns: unknown };
      write_record: { Args: { p_table: string; p_aircraft: string; p_id: string; p_base: string; p_patch: Record<string, unknown> | null; p_delete: boolean }; Returns: unknown };
      can_read_inbox_blob: { Args: { p_path:string }; Returns:boolean };
      restore_inbox_destination: { Args: { p_aircraft: string; p_id: string; p_kind: string; p_proposal: Record<string,unknown>; p_approved: boolean; p_document?:string|null; p_pages?:string[] }; Returns: undefined };
      complete_inbox_analysis: { Args: { p_aircraft: string; p_id: string; p_base: string; p_kind: string; p_proposal: Record<string, unknown>; p_error?: string | null }; Returns: unknown };
      stage_inbox_page: { Args: { p_aircraft: string; p_id: string; p_page: unknown }; Returns: unknown };
      import_aircraft_expenses: { Args: { p_aircraft: string; p_rows: unknown }; Returns: undefined };
      approve_aircraft_inbox: { Args: { p_aircraft: string; p_id: string; p_base: string; p_kind: string; p_book?: string | null; p_component?: string | null; p_proposal?: Record<string, unknown>; p_count?: number }; Returns: unknown };
      confirm_scanned_document: { Args: { p_page: string; p_base: string }; Returns: undefined };
      replace_page_extraction: { Args: { p_page: string; p_started_at: string; p_entries: unknown[]; p_state: Record<string, unknown>; p_stickers: string[] }; Returns: undefined };
      merge_log_entry: { Args: { p_aircraft: string; p_head: string; p_tail: string; p_head_base: string; p_tail_base: string; p_fields: Record<string, unknown> }; Returns: unknown };

      claim_background_job: { Args: { p_key: string }; Returns: string | null };
      release_background_job: { Args: { p_key: string; p_token: string }; Returns: undefined };
      commit_reminder_inbox: { Args: { p_notifications: Record<string, unknown>[]; p_receipts: Record<string, unknown>[] }; Returns: undefined };
      complete_reading_batch: { Args: { p_batch_id: string }; Returns: boolean };
      onboarding_email_candidates: { Args: { p_preview?: boolean }; Returns: OnboardingEmailCandidate[] };
      unsubscribe_onboarding_email: { Args: { p_token: string }; Returns: boolean };
      has_aircraft_access: {
        Args: { target_aircraft: string };
        Returns: boolean;
      };
      can_edit_aircraft: {
        Args: { target_aircraft: string };
        Returns: boolean;
      };
      set_expected_hours: {
        Args: { target_aircraft: string; hours_per_week: number | null };
        Returns: string;
      };
      sign_authored_entry: {
        Args: {
          p_challenge_id: string; p_code: string;
          p_id: string; p_aircraft_id: string; p_logbook_id: string;
          p_template_id: string; p_template_version: number; p_entry_date: string;
          p_hobbs: number | null; p_tach: number | null; p_airframe: number | null;
          p_work: string; p_answers: Record<string, string>; p_credential_id: string;
          p_performed_by: string; p_supersedes_entry_id: string | null; p_attested: boolean;
        };
        Returns: string;
      };
      transfer_aircraft: {
        Args: { target_aircraft: string; new_owner_email: string };
        Returns: undefined;
      };
      // 0059: SECURITY DEFINER, because a phone signed into a second account has
      // to be able to move its APNs or FCM token off the first.
      register_device_token: {
        Args: { p_token: string; p_platform: string };
        Returns: undefined;
      };
      search_log_entries: {
        Args: { target_aircraft: string; q: string };
        Returns: LogEntry[];
      };
      shared_key_cost_today: {
        Args: Record<string, never>;
        Returns: number;
      };
      reserve_ai_call: {
        Args: {
          p_user_id: string;
          p_cap: number;
          p_usd_cap: number;
          p_own_key: boolean;
          p_estimate: number;
        };
        Returns: string | null;
      };
      claim_reading_pages: { Args: { p_limit: number }; Returns: Page[] };
      reserve_ai_call_v2: {
        Args: {
          p_user_id: string;
          p_cap: number;
          p_usd_cap: number;
          p_own_key: boolean;
          p_estimate: number;
          p_provider: "anthropic" | "openai";
        };
        Returns: string | null;
      };
      my_ai_key_last4: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      my_ai_key_metadata: {
        Args: Record<string, never>;
        Returns: { provider: "anthropic" | "openai"; last4: string | null } | null;
      };
      ai_key_cipher: {
        Args: { p_user_id: string };
        Returns: string | null;
      };
      ai_key_provider: {
        Args: { p_user_id: string };
        Returns: "anthropic" | "openai" | null;
      };
      upsert_ai_key: {
        Args: { p_user_id: string; p_cipher: string; p_last4: string };
        Returns: undefined;
      };
      upsert_ai_key_v2: {
        Args: { p_user_id: string; p_provider: "anthropic" | "openai"; p_cipher: string; p_last4: string };
        Returns: undefined;
      };
      delete_ai_key: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      // MyFlightBook credentials live in a private schema (0047); reached via these.
      my_mfb_status: {
        Args: Record<string, never>;
        Returns: { client_id: string | null; mfb_username: string | null; connected: boolean; has_secret: boolean }[];
      };
      mfb_conn_secrets: {
        Args: { p_user_id: string };
        Returns: {
          client_id: string | null;
          client_secret: string | null;
          access_token: string | null;
          refresh_token: string | null;
          token_expires_at: string | null;
        }[];
      };
      upsert_mfb_credentials: {
        Args: { p_user_id: string; p_client_id: string; p_mfb_username: string | null; p_client_secret_cipher: string | null };
        Returns: undefined;
      };
      set_mfb_tokens: {
        Args: {
          p_user_id: string;
          p_access: string | null;
          p_refresh: string | null;
          p_expires_at: string | null;
          p_mark_connected: boolean;
        };
        Returns: undefined;
      };
      disconnect_mfb: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      mfb_conns_to_sync: {
        Args: Record<string, never>;
        Returns: { user_id: string; last_synced_at: string | null }[];
      };
      stamp_mfb_synced: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      set_mfb_client_secret: {
        Args: { p_user_id: string; p_cipher: string };
        Returns: undefined;
      };
      // Cloud backups (0049). The destination tokens live in a private schema;
      // only backup_due_runs (service_role only) ever returns ciphertext.
      my_backup_destinations: {
        Args: Record<string, never>;
        Returns: {
          provider: string;
          account_label: string | null;
          connected: boolean;
          folder_path: string | null;
          frequency: "off" | "monthly" | "quarterly";
          day_of_month: number | null;
          next_run_at: string | null;
          last_run_at: string | null;
          last_status: BackupRun["status"] | null;
          last_bytes: number | null;
          last_error: string | null;
          consecutive_failures: number;
        }[];
      };
      upsert_backup_destination: {
        Args: {
          p_user_id: string;
          p_provider: string;
          p_account_label: string | null;
          p_access_cipher: string | null;
          p_refresh_cipher: string | null;
          p_expires_at: string | null;
        };
        Returns: string;
      };
      set_backup_tokens: {
        Args: { p_destination_id: string; p_access_cipher: string | null; p_expires_at: string | null };
        Returns: undefined;
      };
      delete_backup_destination: {
        Args: { p_user_id: string; p_provider: string };
        Returns: undefined;
      };
      // 0050: keyed on (user_id, provider) — one schedule per DESTINATION, so a
      // user can back up to Dropbox and Google Drive at the same time.
      set_backup_schedule: {
        Args: {
          p_user_id: string;
          p_provider: string;
          p_frequency: string;
          p_day_of_month: number;
          p_next_run_at: string | null;
        };
        Returns: undefined;
      };
      // 0050: opaque per-provider state (a Drive folder id), not a path.
      set_backup_folder: {
        Args: { p_destination_id: string; p_folder_path: string | null };
        Returns: undefined;
      };
      backup_due_runs: {
        Args: { p_now: string };
        Returns: {
          schedule_id: string;
          user_id: string;
          aircraft_id: string | null;
          destination_id: string;
          provider: string;
          folder_path: string | null;
          access_cipher: string | null;
          refresh_cipher: string | null;
          expires_at: string | null;
          frequency: string;
          day_of_month: number | null;
        }[];
      };
      claim_backup_schedule: {
        Args: { p_schedule_id: string; p_lease_minutes: number };
        Returns: boolean;
      };
      start_backup_run: {
        Args: { p_schedule_id: string; p_user_id: string; p_aircraft_id: string | null };
        Returns: string;
      };
      finish_backup_run: {
        Args: {
          p_run_id: string;
          p_status: string;
          p_bytes: number | null;
          p_remote_path: string | null;
          p_error: string | null;
        };
        Returns: undefined;
      };
      complete_backup_schedule: {
        Args: { p_schedule_id: string; p_next_run_at: string | null; p_failed: boolean };
        Returns: number;
      };
    };
    Enums: {
      logbook_type: LogbookType;
      review_status: ReviewStatus;
      document_type: DocumentType;
      extraction_status: ExtractionStatus | QueuedExtractionStatus;
      ad_kind: AdKind;
      ad_status: AdStatus;
      trust_level: TrustLevel;
      visit_status: VisitStatus;
      gap_status: GapStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

/**
 * Hand-maintained types mirroring supabase/migrations/*.sql (schema v1).
 * Once the Supabase CLI is linked, regenerate with:
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 * Until then this keeps the app type-safe against the schema.
 */

export type LogbookType = "airframe" | "engine" | "prop" | "avionics" | "other";
export type ReviewStatus = "unreviewed" | "confirmed" | "disputed";
export type ExtractionStatus = "pending" | "processing" | "extracted" | "failed";
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
  notes: string | null;
  is_demo: boolean;
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
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  detected_page_count: number | null;
  extracted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LogEntry = {
  id: string;
  page_id: string | null;
  logbook_id: string;
  aircraft_id: string;
  entry_date: string | null;
  hobbs: number | null;
  tach: number | null;
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
  created_at: string;
  updated_at: string;
}

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
  created_at: string;
  updated_at: string;
}

/** A free-text external reference on a log entry (STC/AC/AD page, etc). */
export type ReferenceLink = { label: string; url: string };

export type Component = {
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
  created_at: string;
  updated_at: string;
}

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
export type OilAnalysisSample = {
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
  created_at: string;
}

/** A user's own Anthropic API key, encrypted at rest. */
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

/** Audit row: which client read which aircraft/scope. */
export type OauthAccessLog = {
  id: string;
  client_id: string | null;
  account_id: string | null;
  aircraft_id: string | null;
  scope: string | null;
  path: string | null;
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
}

/** Latest recorded hobbs/tach for an aircraft, e.g. synced from MyFlightBook. */
export type HoursReading = {
  id: string;
  aircraft_id: string;
  reading_date: string | null;
  hobbs: number | null;
  tach: number | null;
  source: string;
  synced_by: string | null;
  external_ref: string | null;
  hours_reviewed_at: string | null;
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
      profile: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile>; Relationships: [] };
      aircraft: { Row: Aircraft; Insert: Partial<Aircraft>; Update: Partial<Aircraft>; Relationships: [] };
      logbook: { Row: Logbook; Insert: Partial<Logbook>; Update: Partial<Logbook>; Relationships: [] };
      page: { Row: Page; Insert: Partial<Page>; Update: Partial<Page>; Relationships: [] };
      log_entry: { Row: LogEntry; Insert: Partial<LogEntry>; Update: Partial<LogEntry>; Relationships: [] };
      document: { Row: DocumentRecord; Insert: Partial<DocumentRecord>; Update: Partial<DocumentRecord>; Relationships: [] };
      component: { Row: Component; Insert: Partial<Component>; Update: Partial<Component>; Relationships: [] };
      ad_compliance: { Row: AdCompliance; Insert: Partial<AdCompliance>; Update: Partial<AdCompliance>; Relationships: [] };
      ad_reference: { Row: AdReference; Insert: Partial<AdReference>; Update: Partial<AdReference>; Relationships: [] };
      equipment_proposal: { Row: EquipmentProposal; Insert: Partial<EquipmentProposal>; Update: Partial<EquipmentProposal>; Relationships: [] };
      maintenance_item: { Row: MaintenanceItem; Insert: Partial<MaintenanceItem>; Update: Partial<MaintenanceItem>; Relationships: [] };
      aircraft_share: { Row: AircraftShare; Insert: Partial<AircraftShare>; Update: Partial<AircraftShare>; Relationships: [] };
      weight_balance: { Row: WeightBalance; Insert: Partial<WeightBalance>; Update: Partial<WeightBalance>; Relationships: [] };
      scanned_document: { Row: ScannedDocument; Insert: Partial<ScannedDocument>; Update: Partial<ScannedDocument>; Relationships: [] };
      mfb_connection: { Row: MfbConnection; Insert: Partial<MfbConnection>; Update: Partial<MfbConnection>; Relationships: [] };
      hours_reading: { Row: HoursReading; Insert: Partial<HoursReading>; Update: Partial<HoursReading>; Relationships: [] };
      ai_usage: { Row: AiUsage; Insert: Partial<AiUsage>; Update: Partial<AiUsage>; Relationships: [] };
      // user_ai_key lives in a private schema (0039) — not exposed to PostgREST;
      // reached only via the ai-key SECURITY DEFINER functions below.
      oil_analysis_sample: { Row: OilAnalysisSample; Insert: Partial<OilAnalysisSample>; Update: Partial<OilAnalysisSample>; Relationships: [] };
      oidc_payloads: { Row: OidcPayload; Insert: Partial<OidcPayload>; Update: Partial<OidcPayload>; Relationships: [] };
      oauth_client: { Row: OauthClient; Insert: Partial<OauthClient>; Update: Partial<OauthClient>; Relationships: [] };
      oauth_aircraft_grant: { Row: OauthAircraftGrant; Insert: Partial<OauthAircraftGrant>; Update: Partial<OauthAircraftGrant>; Relationships: [] };
      oauth_account_grant: { Row: OauthAccountGrant; Insert: Partial<OauthAccountGrant>; Update: Partial<OauthAccountGrant>; Relationships: [] };
      oauth_access_log: { Row: OauthAccessLog; Insert: Partial<OauthAccessLog>; Update: Partial<OauthAccessLog>; Relationships: [] };
      reminder_log: { Row: ReminderLog; Insert: Partial<ReminderLog>; Update: Partial<ReminderLog>; Relationships: [] };
    };
    Views: {
      admin_user_stats: { Row: AdminUserStat; Relationships: [] };
    };
    Functions: {
      has_aircraft_access: {
        Args: { target_aircraft: string };
        Returns: boolean;
      };
      can_edit_aircraft: {
        Args: { target_aircraft: string };
        Returns: boolean;
      };
      transfer_aircraft: {
        Args: { target_aircraft: string; new_owner_email: string };
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
      my_ai_key_last4: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      ai_key_cipher: {
        Args: { p_user_id: string };
        Returns: string | null;
      };
      upsert_ai_key: {
        Args: { p_user_id: string; p_cipher: string; p_last4: string };
        Returns: undefined;
      };
      delete_ai_key: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      logbook_type: LogbookType;
      review_status: ReviewStatus;
      document_type: DocumentType;
      extraction_status: ExtractionStatus;
      ad_kind: AdKind;
      ad_status: AdStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

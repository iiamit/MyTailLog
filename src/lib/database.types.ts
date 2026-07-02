/**
 * Hand-maintained types mirroring supabase/migrations/*.sql (schema v1).
 * Once the Supabase CLI is linked, regenerate with:
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 * Until then this keeps the app type-safe against the schema.
 */

export type LogbookType = "airframe" | "engine" | "prop" | "avionics";
export type ReviewStatus = "unreviewed" | "confirmed" | "disputed";
export type ExtractionStatus = "pending" | "processing" | "extracted" | "failed";
export type DocumentType =
  | "form_337"
  | "form_8130_3"
  | "stc"
  | "ica"
  | "weight_balance"
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
  extraction_schema_version: number;
  extraction_model: string | null;
  owner_confirmed: boolean;
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
  created_at: string;
  updated_at: string;
}

export type Component = {
  id: string;
  aircraft_id: string;
  name: string;
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

export type Profile = {
  id: string;
  full_name: string | null;
  cert_number: string | null;
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
    };
    Views: Record<string, never>;
    Functions: {
      has_aircraft_access: {
        Args: { target_aircraft: string };
        Returns: boolean;
      };
      search_log_entries: {
        Args: { target_aircraft: string; q: string };
        Returns: LogEntry[];
      };
    };
    Enums: {
      logbook_type: LogbookType;
      review_status: ReviewStatus;
      document_type: DocumentType;
      extraction_status: ExtractionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

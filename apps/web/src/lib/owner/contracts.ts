import type {
  Component,
  OilAddition,
  OilAnalysisSample,
} from "@/lib/database.types";
import type {
  CompressionReading,
  CompressionTest,
  OilChange,
  OilInterval,
} from "@/lib/engineTrends";

export type InboxKind = "unclassified" | "logbook" | "invoice" | "oil_report";
export type InboxItem = {
  restore_source_id?: string | null;
  id: string;
  aircraft_id: string;
  created_by: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  sha256: string;
  kind: InboxKind;
  state: "uploaded" | "review" | "approved" | "failed";
  proposal: Record<string, unknown>;
  document_id: string | null;
  page_ids: string[];
  rendered_pages: {
    index: number;
    pageId: string;
    storagePath: string;
    sha256: string;
    imagePhash?: string;
  }[];
  processing_until?: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
export type Expense = {
  id: string;
  aircraft_id: string;
  date: string;
  currency: string;
  amount_minor: number;
  category: string;
  cost_type: "fixed" | "variable";
  basis: "actual" | "reserve";
  vendor: string | null;
  notes: string | null;
  payer: string | null;
  document_id: string | null;
  log_entry_id: string | null;
  inbox_id: string | null;
  created_at: string;
  updated_at: string;
};
export type EngineEvent = {
  id: string;
  aircraft_id: string;
  component_id: string;
  event_date: string;
  kind: "overhaul" | "cylinder_replacement" | "compression";
  notes: string | null;
  readings: CompressionReading[];
  cylinders: number[];
  source_entry_id: string | null;
  source_page_id: string | null;
  meter_basis: "tach" | "hobbs" | null;
  meter_reading: number | null;
  created_at: string;
  updated_at: string;
};
export type EngineGroup = {
  componentId: string;
  name: string;
  position: string | null;
  start: string | null;
  end: string | null;
  segmentId: string;
  compression: CompressionTest[];
  oilChanges: OilChange[];
  oilIntervals: OilInterval[];
  samples: OilAnalysisSample[];
  additions: OilAddition[];
};
export type EngineHistory = {
  sources?: {
    entries: {
      id: string;
      date: string | null;
      description: string;
      pageId: string | null;
    }[];
    pages: { id: string; label: string }[];
  };
  components: (Component & { position?: string | null })[];
  events: EngineEvent[];
  groups: EngineGroup[];
  unassigned: {
    compression: CompressionTest[];
    oilChanges: OilChange[];
    samples: OilAnalysisSample[];
    additions: OilAddition[];
  };
  needsReview: {
    entryId: string;
    pageId: string | null;
    date: string | null;
    reason: string;
  }[];
  canEdit: boolean;
};

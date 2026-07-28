// Records Vault document categories — client-safe (no server/SDK deps) so the
// Vault UI, the entry-attachment UI, and the upload action all share one list.
import type { DocumentType } from "@/lib/database.types";

// Display order in the Vault (permanent records first, then paperwork).
export const DOCUMENT_TYPES: DocumentType[] = [
  "airworthiness_cert",
  "registration",
  "radio_license",
  "poh_afm",
  "weight_balance",
  "stc",
  "form_337",
  "form_8130_3",
  "ica",
  "maintenance_manual",
  "other",
];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  airworthiness_cert: "Airworthiness certificate",
  registration: "Registration",
  radio_license: "Radio station authorization",
  poh_afm: "POH / AFM",
  weight_balance: "Weight & balance",
  stc: "STCs",
  form_337: "Form 337",
  form_8130_3: "Form 8130-3",
  ica: "ICA",
  maintenance_manual: "Maintenance manuals",
  other: "Other",
};

export const documentTypeLabel = (t: DocumentType): string => DOCUMENT_TYPE_LABELS[t] ?? t;

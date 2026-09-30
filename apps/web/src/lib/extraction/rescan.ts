import { sameLoggedEvent, type DupEntry } from "@/lib/duplicates";

export type ExistingEntry = DupEntry & {
  authored_digest: string | null;
  authored_signed_at: string | null;
};

/** Exact ID + digest matching works for full-size new stickers and earlier short IDs. */
export function signedEntriesOnScan(rawText: string, existing: ExistingEntry[]): ExistingEntry[] {
  const markers = [
    ...rawText.matchAll(/MTL\s+ENTRY\s+ID\s*:\s*([0-9a-f-]{36})[\s\S]{0,140}?MTL\s+DIGEST\s*:\s*([0-9a-f]{16})\b/gi),
    ...rawText.matchAll(/\bEntry\s+([0-9a-f]{8})\s*[·•|,;\-]?\s*Digest\s+([0-9a-f]{12})\b/gi),
  ];
  return existing.filter((entry) => entry.authored_signed_at && entry.authored_digest &&
    markers.some((marker) => entry.id.toLowerCase().startsWith(marker[1].toLowerCase()) &&
      entry.authored_digest!.toLowerCase().startsWith(marker[2].toLowerCase())));
}

/** Only exact marker matches or the existing event-matching rule suppress a row. */
export function isRescannedEntry(candidate: DupEntry, existing: ExistingEntry[], linkedSigned: ExistingEntry[]): boolean {
  if (existing.some((entry) => sameLoggedEvent(candidate, entry))) return true;
  return linkedSigned.some((entry) =>
    candidate.text.toLowerCase().includes(entry.id.toLowerCase()) ||
    candidate.text.toLowerCase().includes(entry.id.slice(0, 8).toLowerCase()));
}

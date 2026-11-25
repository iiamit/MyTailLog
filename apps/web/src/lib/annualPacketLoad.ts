import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdCompliance, Database } from "./database.types";
import { loadShareInput } from "./share/model";
import { buildAnnualPacket, type PacketEvidence } from "./annualPacket";
import { aircraftStoragePath } from "./storagePath";

/** Every storage reference is read through the caller's RLS before service-backed blob I/O. */
export async function loadAnnualPacket(
  client: SupabaseClient<Database>,
  aircraftId: string,
  userId: string,
) {
  const share = await loadShareInput(client, aircraftId, userId);
  if (!share) return null;
  const paths = new Map<string, string>();
  const evidence: PacketEvidence[] = [];
  const books = new Map(
    (share.input.logbook ?? []).map((b) => [b.id, b.title || b.type]),
  );
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from("page")
      .select("id, logbook_id, page_sequence, review_status, storage_path")
      .eq("aircraft_id", aircraftId)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    for (const page of data ?? []) {
      const available =
        !!page.storage_path &&
        aircraftStoragePath(page.storage_path, aircraftId);
      if (available) paths.set(`page:${page.id}`, page.storage_path);
      evidence.push({
        id: page.id,
        kind: "page",
        label: `${books.get(page.logbook_id) ?? "Logbook"} p. ${page.page_sequence ?? "?"} · ${page.review_status}`,
        available,
        href: `/api/page/${page.id}/image`,
        fileName: `scans/${page.id}.jpg`,
      });
    }
    if (!data || data.length < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from("document")
      .select("id, title, file_name, storage_path, mime_type")
      .eq("aircraft_id", aircraftId)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    for (const doc of data ?? []) {
      const available =
        !!doc.storage_path && aircraftStoragePath(doc.storage_path, aircraftId);
      if (available) paths.set(`document:${doc.id}`, doc.storage_path!);
      const name = (doc.file_name || "document")
        .replace(/[^\w.-]/g, "_")
        .slice(-100);
      evidence.push({
        id: doc.id,
        kind: "document",
        label: doc.title || doc.file_name || "Untitled document",
        available,
        href: `/api/document/${doc.id}`,
        fileName: `documents/${doc.id}-${name}`,
      });
    }
    if (!data || data.length < 500) break;
  }
  const directives: AdCompliance[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from("ad_compliance")
      .select("*")
      .eq("aircraft_id", aircraftId)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    directives.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  share.extras.ads = directives;
  return {
    packet: buildAnnualPacket(share, evidence, directives ?? []),
    paths,
  };
}

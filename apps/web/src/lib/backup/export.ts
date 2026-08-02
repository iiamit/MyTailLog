import { zip, type AsyncZippable } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { collectBackupData } from "./collect";
import { buildReadme } from "./readme";

type Progress = (msg: string) => void;

/**
 * Build a portable .zip of one aircraft's entire dataset (records + original
 * scans). Runs entirely in the browser — scans stream through the app's own
 * RLS-scoped serving routes (backend-agnostic) into the archive.
 *
 * Rows and the manifest come from ./collect.ts, shared with the server-side
 * scheduled backup (./serverArchive.ts), so the archive a user downloads and
 * the one pushed to their cloud stay byte-for-byte the same format.
 *
 * ponytail: whole archive is assembled in memory. Fine here — a person clicked
 * a button on their own machine. The unattended path can't afford that and
 * streams instead; see serverArchive.ts.
 */
export async function exportBackup(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  onProgress?: Progress,
): Promise<{ blob: Blob; tail: string }> {
  onProgress?.("Reading records…");

  const { data, manifest, blobs, tail } = await collectBackupData(supabase, aircraftId);

  const files: AsyncZippable = {};

  // Fetch each blob through the app's RLS-scoped serving routes (works on any
  // storage backend). JPEGs are already compressed, so store them (level 0) and
  // only compress the JSON.
  let done = 0;
  for (const ref of blobs) {
    const url = ref.prefix === "docs" ? `/api/document/${ref.id}` : `/api/page/${ref.id}/image`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        files[ref.entry] = [buf, { level: 0 }];
      }
    } catch {
      // Skip a scan that can't be fetched; the rest of the backup still saves.
    }
    onProgress?.(`Packing scans… ${++done}/${blobs.length}`);
  }

  const enc = new TextEncoder();
  files["manifest.json"] = [enc.encode(JSON.stringify(manifest, null, 2)), { level: 6 }];
  files["data.json"] = [enc.encode(JSON.stringify(data)), { level: 6 }];
  // Human-readable export manifest: what every file and column in this archive
  // is, so it's still legible without MyTailLog years from now.
  files["README.txt"] = [enc.encode(buildReadme(data, manifest)), { level: 6 }];

  onProgress?.("Compressing…");
  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, (err, out) => (err ? reject(err) : resolve(out))),
  );

  return {
    blob: new Blob([zipped as BlobPart], { type: "application/zip" }),
    tail,
  };
}

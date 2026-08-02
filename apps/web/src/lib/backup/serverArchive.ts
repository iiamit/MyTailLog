import { PassThrough, type Readable } from "node:stream";
import { once } from "node:events";
import { Zip, ZipPassThrough, ZipDeflate } from "fflate";
import { buildReadme } from "./readme";
import type { CollectedBackup } from "./collect";

// ===========================================================================
// Server-side archive builder — the unattended counterpart to the browser
// export in ./export.ts.
//
// Why this exists separately: the browser version assembles the WHOLE archive
// in memory and hands back a Blob. That's fine when a person clicked a button
// on their own machine, but the scheduled cloud backup runs on a Cloud Run
// instance with memoryMiB:1024 (apphosting.yaml), and a 300-page aircraft is
// ~600 MB of scans. Buffering that would OOM the instance serving live traffic.
//
// So this one STREAMS: one blob is resident at a time (each is capped at 25 MB
// by the upload routes), pushed into the zip and flushed downstream before the
// next is read. Peak memory is one blob plus whatever the consumer hasn't
// drained — not the archive size.
//
// The format is produced by ./collect.ts, shared with the browser export, so
// the two archives cannot drift apart.
// ===========================================================================

/**
 * Reads a blob's bytes, or null if it's missing. Injected rather than imported
 * so this module stays free of `server-only` (which would make it untestable
 * under the plain node:test runner) and so tests can supply a fake.
 * `lib/storage.ts`'s `getBlob` satisfies this.
 */
export type BlobReader = (path: string) => Promise<{ data: Buffer } | null>;

export type ArchiveStats = {
  bytes: number;
  /** Blobs written into the archive. */
  scans: number;
  /** Blobs that were listed in the rows but couldn't be read from storage. */
  missing: number;
};

export type ServerArchive = {
  /** Zip bytes. Pipe this straight at a provider's chunked upload. */
  stream: Readable;
  /** Suggested file name, e.g. `2026-08-02-N734DM.zip`. */
  filename: string;
  /** Resolves when the archive is fully written; rejects if it failed. */
  result: Promise<ArchiveStats>;
};

/** `YYYY-MM-DD-<TAIL>.zip`, sortable and obvious in a cloud folder listing. */
export function archiveFilename(tail: string, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  const safe = tail.replace(/[^A-Za-z0-9-]/g, "") || "aircraft";
  return `${day}-${safe}.zip`;
}

/**
 * Build the archive as a stream. Returns immediately; bytes flow as the
 * consumer reads. Await `result` for the totals (and to surface failures).
 *
 * A blob that can't be read is skipped and counted, never fatal — one
 * unreadable scan must not cost the user the other 299 pages and every record.
 */
export function buildServerArchive(
  collected: CollectedBackup,
  readBlob: BlobReader,
  now: Date = new Date(),
): ServerArchive {
  const { data, manifest, blobs, tail } = collected;
  const out = new PassThrough();

  let bytes = 0;
  let backpressured = false;

  const zip = new Zip((err, chunk, final) => {
    if (err) {
      out.destroy(err);
      return;
    }
    if (chunk.length) {
      bytes += chunk.length;
      // Buffer.from(chunk) copies: fflate reuses its output buffer, so handing
      // the raw view to a stream that hasn't drained yet would corrupt it.
      if (!out.write(Buffer.from(chunk))) backpressured = true;
    }
    if (final) out.end();
  });

  const result = (async (): Promise<ArchiveStats> => {
    const drain = async () => {
      if (backpressured) {
        await once(out, "drain");
        backpressured = false;
      }
    };

    // Text entries are worth compressing; the JPEG/PDF blobs below are not.
    const text = (name: string, body: string) => {
      const f = new ZipDeflate(name, { level: 6 });
      zip.add(f);
      f.push(new TextEncoder().encode(body), true);
    };

    let scans = 0;
    let missing = 0;

    try {
      text("manifest.json", JSON.stringify(manifest, null, 2));
      text("data.json", JSON.stringify(data));
      // Human-readable export manifest: what every file and column in this
      // archive is, so it's still legible without MyTailLog years from now.
      text("README.txt", buildReadme(data, manifest));
      await drain();

      for (const ref of blobs) {
        const blob = await readBlob(ref.storagePath);
        if (!blob) {
          missing++;
          continue;
        }
        // Stored, not deflated: these are already-compressed JPEG/PNG/PDF, so
        // deflating them burns CPU on an instance shared with live traffic and
        // saves nothing. Matches the browser export's `level: 0`.
        const f = new ZipPassThrough(ref.entry);
        zip.add(f);
        f.push(new Uint8Array(blob.data), true);
        scans++;
        await drain();
      }

      zip.end();
      // Wait for the PassThrough to actually finish so `bytes` is final and a
      // late zip error still surfaces here rather than as an unhandled reject.
      await once(out, "finish");
      return { bytes, scans, missing };
    } catch (e) {
      out.destroy(e as Error);
      throw e;
    }
  })();

  // The consumer awaits `result`; without this a failure before anyone attaches
  // a handler would crash the process as an unhandled rejection.
  result.catch(() => {});

  return { stream: out, filename: archiveFilename(tail, now), result };
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { Bucket } from "@google-cloud/storage";

// ===========================================================================
// Blob storage abstraction — the ONE place that talks to a storage backend.
//
// `STORAGE_BACKEND=gcs` → Google Cloud Storage (consolidates onto GCP and lifts
// Supabase's egress/storage free-tier caps — see the image-egress history);
// anything else → Supabase Storage (the default, so this is a no-op until we
// flip the flag). Every server call site goes through here, so the cutover is a
// single env change.
//
// Byte I/O runs with SERVICE credentials, NOT the request's RLS client: GCS has
// no row-level security, so access is gated one layer up (the serving routes
// 404 on an RLS row miss; the write routes check can_edit). That's the same
// model GCS forces, applied uniformly to both backends. Server-only — never
// import from a client component.
// ===========================================================================

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";
const BACKEND: "gcs" | "supabase" = process.env.STORAGE_BACKEND === "gcs" ? "gcs" : "supabase";

export type PutOpts = { contentType?: string; upsert?: boolean };
export type PutBody = Blob | Buffer | Uint8Array;

// Lazy so the Supabase path never loads the GCS SDK or needs GCP credentials.
let gcsBucket: Bucket | null = null;
async function bucket(): Promise<Bucket> {
  if (!gcsBucket) {
    const name = process.env.GCS_BUCKET;
    if (!name) throw new Error("STORAGE_BACKEND=gcs requires GCS_BUCKET to be set");
    const { Storage } = await import("@google-cloud/storage");
    // No key file: on Firebase App Hosting (Cloud Run) the runtime service
    // account supplies Application Default Credentials automatically.
    gcsBucket = new Storage().bucket(name);
  }
  return gcsBucket;
}

let svc: ReturnType<typeof createServiceClient> | null = null;
const supa = () => (svc ??= createServiceClient());

async function toBuffer(body: PutBody): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await body.arrayBuffer());
}

/** Fetch a blob's bytes + content-type, or null if it's missing. */
export async function getBlob(
  path: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  if (BACKEND === "gcs") {
    try {
      const file = (await bucket()).file(path);
      const [buf] = await file.download();
      const [meta] = await file.getMetadata();
      return { data: buf, contentType: meta.contentType || "application/octet-stream" };
    } catch {
      return null;
    }
  }
  const { data, error } = await supa().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return {
    data: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || "application/octet-stream",
  };
}

/**
 * Store a blob. `upsert:false` fails if the key already exists (matches the
 * documents route). Returns `{ error }` rather than throwing so callers can do
 * orphan cleanup, mirroring the Supabase upload shape.
 */
export async function putBlob(
  path: string,
  body: PutBody,
  opts: PutOpts = {},
): Promise<{ error: string | null }> {
  const { contentType, upsert = true } = opts;
  if (BACKEND === "gcs") {
    try {
      const file = (await bucket()).file(path);
      if (!upsert) {
        const [exists] = await file.exists();
        if (exists) return { error: "A file already exists at that path." };
      }
      await file.save(await toBuffer(body), { contentType, resumable: false });
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Upload failed." };
    }
  }
  const { error } = await supa()
    .storage.from(BUCKET)
    .upload(path, body as Blob | Buffer, { contentType, upsert });
  return { error: error?.message ?? null };
}

/** Best-effort delete of many blobs. Never throws (cleanup is non-critical). */
export async function removeBlobs(paths: string[]): Promise<void> {
  const keys = paths.filter(Boolean);
  if (!keys.length) return;
  if (BACKEND === "gcs") {
    const b = await bucket();
    await Promise.all(keys.map((p) => b.file(p).delete({ ignoreNotFound: true }).catch(() => {})));
    return;
  }
  // Supabase caps a remove() at ~100 keys per call.
  for (let i = 0; i < keys.length; i += 100) {
    await supa()
      .storage.from(BUCKET)
      .remove(keys.slice(i, i + 100));
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { gcsHealthcheck } from "@/lib/storage";

// Admin-only GCS reachability probe. Hit this on the DEPLOYED app (while still on
// the Supabase backend) to confirm the runtime service account can write/read/
// delete in the bucket before flipping STORAGE_BACKEND=gcs. Returns `ok: true`
// only if all three succeed; otherwise `error` carries the failure (e.g. a 403 =
// the runtime SA isn't bound on the bucket).
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: me } = await supabase.from("profile").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const result = await gcsHealthcheck();
  return NextResponse.json(
    { backend: process.env.STORAGE_BACKEND || "supabase", bucket: process.env.GCS_BUCKET || null, ...result },
    { status: result.ok ? 200 : 500 },
  );
}

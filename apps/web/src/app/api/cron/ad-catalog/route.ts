import { createServiceClient } from "@/lib/supabase/service";
import { cronDenied, json } from "@/lib/cronAuth";
import { validCatalogRow } from "@/lib/faa/adCatalog";

export const runtime = "nodejs";

/** GitHub fetches the public FAA feed; this server keeps the DB write key. */
export async function POST(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 200 || !rows.every(validCatalogRow)) {
    return json({ error: "Invalid AD catalog batch." }, 400);
  }
  const { error } = await createServiceClient().from("ad_catalog")
    .upsert(rows, { onConflict: "ad_number" });
  return error ? json({ error: error.message }, 500) : json({ upserted: rows.length });
}

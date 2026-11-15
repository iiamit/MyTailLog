// ===========================================================================
// Backfill / refresh the public AD catalog (ad_catalog, migration 0067) from
// the Federal Register API.
//
//   npx tsx scripts/ad-catalog-backfill.ts            # fetch + upsert
//   npx tsx scripts/ad-catalog-backfill.ts --dry-run  # fetch + report only
//
// Env (not needed for --dry-run):
//   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) — bypasses RLS to write
//
// Runs from the weekly GitHub Action (.github/workflows/ad-catalog.yml), never
// from the production server: the Federal Register IP-blocks Cloud Run egress.
// Idempotent (upsert on ad_number), paginated, one request per second.
// ===========================================================================

import { createClient } from "@supabase/supabase-js";
import { searchADs, type FaaAd } from "../src/lib/faa/federalRegister";
import { BACKFILL_TERMS, buildCatalogRow, preferAd, type AdCatalogRow } from "../src/lib/faa/adCatalog";

const PER_PAGE = 100;
const DELAY_MS = 1000;
const UPSERT_CHUNK = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fail(message: string): never {
  console.error(`ad-catalog-backfill: ${message}`);
  process.exit(1);
}

async function fetchPage(term: string, page: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await searchADs(term, { perPage: PER_PAGE, page });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/returned 403/.test(msg)) {
        fail(
          `the Federal Register refused this runner (HTTP 403) on "${term}" page ${page}. ` +
            `Its origin IP-blocks some datacenter egress; run the backfill from another network. ${msg}`,
        );
      }
      if (attempt >= 3) fail(`giving up on "${term}" page ${page}: ${msg}`);
      console.warn(`  retrying "${term}" page ${page} after error: ${msg}`);
      await sleep(DELAY_MS * 5 * attempt);
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const byAd = new Map<string, FaaAd>();
  let fetched = 0;

  for (const term of BACKFILL_TERMS) {
    let total = 0;
    for (let page = 1; ; page++) {
      const { count, ads } = await fetchPage(term, page);
      total = count;
      fetched += ads.length;
      for (const ad of ads) {
        if (ad.adNumber) byAd.set(ad.adNumber, preferAd(byAd.get(ad.adNumber), ad));
      }
      await sleep(DELAY_MS);
      if (ads.length < PER_PAGE || page * PER_PAGE >= count) break;
    }
    console.log(`${term}: ${total} documents`);
  }

  const rows: AdCatalogRow[] = [];
  for (const ad of byAd.values()) {
    const row = buildCatalogRow(ad);
    if (row) rows.push(row);
  }
  console.log(
    `fetched ${fetched} documents, ${byAd.size} distinct ADs, ${rows.length} with a recognized make and model`,
  );

  if (dryRun) {
    const perMake = new Map<string, number>();
    for (const r of rows) for (const m of r.makes) perMake.set(m, (perMake.get(m) ?? 0) + 1);
    console.log(`per make: ${[...perMake].map(([m, n]) => `${m}=${n}`).join(" ")}`);
    for (const r of rows.slice(0, 10)) {
      console.log(`  ${r.ad_number} [${r.makes.join(",")}] ${r.models.slice(0, 8).join(" ")}`);
    }
    return;
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (or pass --dry-run)");
  if (rows.length === 0) fail("no catalog rows built — refusing to report success on an empty fetch");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK).map((r) => ({ ...r, updated_at: now }));
    const { error } = await supabase.from("ad_catalog").upsert(chunk, { onConflict: "ad_number" });
    if (error) fail(`upsert failed at row ${i}: ${error.message}`);
  }
  console.log(`upserted ${rows.length} rows into ad_catalog`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

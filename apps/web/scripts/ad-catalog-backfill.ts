// ===========================================================================
// Backfill / refresh the public AD catalog (ad_catalog, migration 0067) from
// the Federal Register API.
//
//   npx tsx scripts/ad-catalog-backfill.ts            # fetch + send to MTL
//   npx tsx scripts/ad-catalog-backfill.ts --dry-run  # fetch + report only
//
// Env (not needed for --dry-run): CRON_SECRET, optional MYTAILLOG_URL.
//
// Runs from the weekly GitHub Action (.github/workflows/ad-catalog.yml), never
// from the production server: the Federal Register IP-blocks Cloud Run egress.
// Idempotent (upsert on ad_number), paginated, one request per second.
// ===========================================================================

import { searchADs, type FaaAd } from "../src/lib/faa/federalRegister";
import { BACKFILL_TERMS, buildCatalogRow, preferAd, validCatalogRow, type AdCatalogRow } from "../src/lib/faa/adCatalog";

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
  const invalid = rows.find((row) => !validCatalogRow(row));
  if (invalid) fail(`catalog row ${invalid.ad_number} failed validation`);
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

  const secret = process.env.CRON_SECRET;
  if (!secret) fail("CRON_SECRET must be set (or pass --dry-run)");
  if (rows.length === 0) fail("no catalog rows built — refusing to report success on an empty fetch");

  const base = (process.env.MYTAILLOG_URL ?? "https://mytaillog.com").replace(/\/$/, "");
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const response = await fetch(`${base}/api/cron/ad-catalog`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ rows: chunk }),
    });
    if (!response.ok) fail(`upload failed at row ${i} (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  console.log(`sent ${rows.length} rows to MyTailLog`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

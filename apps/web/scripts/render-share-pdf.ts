// Render the maintenance summary and pre-buy dossier PDFs for one TEST aircraft, to look at them (10 §13 review).
//   cd apps/web && node --import tsx scripts/render-share-pdf.ts <aircraftId> <outDir>
// Reads ../../.env.test.local (or $TEST_ENV_FILE) and refuses anything but the TEST project. Read-only.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { buildDossier, buildSummary, loadShareInput } from "../src/lib/share/model";

const TEST_REF = "arpirbajxbrjbkldteaz";

async function main() {
  const [aircraftId, outDir] = process.argv.slice(2);
  if (!aircraftId || !outDir) throw new Error("usage: render-share-pdf.ts <aircraftId> <outDir>");
  const env = Object.fromEntries(readFileSync(process.env.TEST_ENV_FILE ?? new URL("../../../.env.test.local", import.meta.url), "utf8")
    .split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${TEST_REF}.supabase.co`) throw new Error("refusing: not the TEST project");
  const db = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const { data: ac } = await db.from("aircraft").select("owner_id").eq("id", aircraftId).single();
  const share = await loadShareInput(db, aircraftId, ac!.owner_id);
  if (!share) throw new Error("aircraft not found");
  const { summaryPdf, dossierPdf } = await import("../src/lib/pdf/render");
  const summary = buildSummary(share);
  const dossier = buildDossier(share, { preparedFor: "a buyer" });
  writeFileSync(join(outDir, "summary.pdf"), await summaryPdf(summary));
  writeFileSync(join(outDir, "dossier.pdf"), await dossierPdf(dossier));
  writeFileSync(join(outDir, "dossier.json"), JSON.stringify({ ...dossier, map: undefined }, null, 2));
  console.log(`items ${summary.items.length}, footnotes ${dossier.footnotes.length}, stops ${dossier.map.stops.length}, gaps ${dossier.map.gaps.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

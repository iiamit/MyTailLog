// ===========================================================================
// Give the demo aircraft N734DM scanned logbook pages, in the TEST project only.
//
//   node --import tsx scripts/seed-demo-pages.ts               # render + upload + write rows
//   node --import tsx scripts/seed-demo-pages.ts --out <dir>   # render JPEGs to <dir> only
//
// Renders phone-scan style page images from the demo's log entries (seed-demo.sql),
// uploads originals + thumbnails at the app's layout (<aircraft>/<logbook>/<page>.jpg),
// writes page / scan_batch rows, links every entry to its page (page_id, field_boxes),
// ties item_completion rows to entries so Status cites pages, and adds what the
// review desk and map need: AI-read entries nobody has confirmed (on their own
// pages), two pages still queued for reading, and logbook gaps.
//
// Idempotent: every row it creates has a deterministic id (hash of aircraft id +
// key), written with upsert, so a re-run replaces its own rows and images and never
// duplicates. It also resets its AI-read entries to unconfirmed.
// shortcut: rows dropped from PLAN on a later edit are not deleted; delete them by
// hand if the plan ever shrinks.
//
// Safety: the project ref is fixed to TEST; the service key is fetched at run time
// from the logged-in Supabase CLI and never printed or stored. Only rows of the
// is_demo N734DM aircraft are touched.
// ===========================================================================

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TEST_REF = "arpirbajxbrjbkldteaz";
const SUPABASE_URL = `https://${TEST_REF}.supabase.co`;
const BUCKET = "logbook-pages";
const MODEL = "claude-opus-4-8";
const SCHEMA_VERSION = 5;

type Book = "airframe" | "engine" | "prop" | "avionics";
type Entry = {
  key: string;                    // existing: `${book}:${date}`; new: `new:...`
  date: string; tach: number;
  description: string; work: string;
  signer: string; cert: string | null;
  adRefs?: string[]; kind?: string;
  confidence?: number; weak?: Record<string, number>;  // per-field confidence below the overall
};
type PagePlan = {
  book: Book; seq: number;
  status: "confirmed" | "ai_read" | "queued";
  batch: "initial" | "recent";
  existing?: string[];            // dates of existing entries on this page (same book)
  fresh?: Entry[];                // AI-read entries this page adds (or, when queued, only drawn)
};

// --- The plan ---------------------------------------------------------------
const PLAN: PagePlan[] = [
  { book: "airframe", seq: 1, status: "confirmed", batch: "initial", existing: ["1978-06-02"] },
  { book: "airframe", seq: 2, status: "confirmed", batch: "initial", existing: ["1998-04-18"] },
  { book: "airframe", seq: 3, status: "confirmed", batch: "initial", existing: ["2011-08-22"] },
  { book: "airframe", seq: 4, status: "confirmed", batch: "initial", existing: ["2019-03-12"] },
  { book: "airframe", seq: 5, status: "confirmed", batch: "initial", existing: ["2024-05-01", "2025-07-20"] },
  { book: "airframe", seq: 6, status: "ai_read", batch: "recent", fresh: [
    { key: "new:af:2026-03-02", date: "2026-03-02", tach: 4205.8, description: "Replaced landing light.",
      work: "Replaced burned out landing light lamp (GE 4509) in L/H wing. Ops check good.",
      signer: "M. Torres", cert: "A&P 3667012", confidence: 0.81, weak: { entry_date: 0.62 } },
    { key: "new:af:2026-07-18", date: "2026-07-18", tach: 4219.6, description: "Annual inspection.",
      work: "1. Annual inspection IAW FAR 43 App. D. 2. Complied with AD 2011-10-09 seat rails, no wear beyond limits. 3. ELT inspected IAW 91.207, battery exp 02/2027. 4. Replaced nose strut seals. Aircraft found airworthy and returned to service.",
      signer: "D. Alvarez", cert: "A&P 3105582 IA", adRefs: ["2011-10-09"], kind: "annual",
      confidence: 0.88, weak: { tach: 0.58 } },
  ] },
  { book: "engine", seq: 1, status: "confirmed", batch: "initial", existing: ["2005-09-14"] },
  { book: "engine", seq: 2, status: "confirmed", batch: "initial", existing: ["2024-11-02", "2025-06-08"] },
  { book: "engine", seq: 3, status: "ai_read", batch: "recent", fresh: [
    { key: "new:eng:2025-10-11", date: "2025-10-11", tach: 4196.4, description: "Oil change.",
      work: "Drained oil, new filter CH48110-1, 7 qts Phillips XC 20W-50 + CamGuard. Cut filter, no metal.",
      signer: "M. Torres", cert: "A&P 3667012", kind: "oil_change", confidence: 0.93 },
    { key: "new:eng:2026-07-18", date: "2026-07-18", tach: 4219.6, description: "Annual inspection, engine.",
      work: "Inspected engine IAW FAR 43 App. D. Compressions 75/73/76/76 over 80. Cleaned, gapped and rotated plugs. Mags timed 25 BTC. No leaks.",
      signer: "D. Alvarez", cert: "A&P 3105582 IA", kind: "annual", confidence: 0.9 },
  ] },
  { book: "engine", seq: 4, status: "queued", batch: "recent", fresh: [
    { key: "draw:eng:2026-10-25", date: "2026-10-25", tach: 4243.0, description: "Oil change.",
      work: "Drained oil, new filter, 7 qts Phillips XC 20W-50. Sample to Blackstone. No leaks noted.",
      signer: "M. Torres", cert: "A&P 3667012" },
  ] },
  { book: "prop", seq: 1, status: "confirmed", batch: "initial", existing: ["2010-04-30"] },
  { book: "prop", seq: 2, status: "confirmed", batch: "initial", existing: ["2025-07-20"] },
  { book: "avionics", seq: 1, status: "confirmed", batch: "initial", existing: ["2019-03-12", "2023-02-11"] },
  { book: "avionics", seq: 2, status: "queued", batch: "recent", fresh: [
    { key: "draw:av:2026-09-30", date: "2026-09-30", tach: 4236.2, description: "Pitot-static & transponder checks.",
      work: "Altimeter and static system tested IAW 91.411 / Part 43 App. E. Transponder tested IAW 91.413 / App. F. Encoder correlation within limits.",
      signer: "AeroCheck Instruments", cert: "CRS #AC2Y441L" },
  ] },
];

// Completions: [item kind or "ad:<ref>", entry key, source]. Existing import rows with
// the same item + date are linked in place; the rest are inserted.
const COMPLETIONS: [string, string][] = [
  ["annual", "airframe:2025-07-20"], ["annual", "airframe:2011-08-22"], ["annual", "airframe:1998-04-18"],
  ["transponder", "airframe:2024-05-01"],
  ["oil_change", "engine:2025-06-08"], ["oil_change", "engine:2024-11-02"],
  ["engine_tbo", "engine:2005-09-14"],
  ["ad:2011-10-09", "airframe:2025-07-20"], ["ad:2011-10-09", "airframe:2011-08-22"],
  // Waiting for review: newer than the counted completion, entry still ai_read.
  ["annual", "new:af:2026-07-18"], ["elt", "new:af:2026-07-18"], ["ad:2011-10-09", "new:af:2026-07-18"],
  ["oil_change", "new:eng:2025-10-11"],
];

const GAPS: { book: Book; from: string; to: string; status: string; note?: string }[] = [
  { book: "airframe", from: "1978-06-02", to: "1998-04-18", status: "open" },
  { book: "airframe", from: "1998-04-18", to: "2011-08-22", status: "asked_previous_owner",
    note: "Emailed the 2009 seller about the 1998 to 2011 airframe log." },
  { book: "engine", from: "2005-09-14", to: "2024-11-02", status: "open" },
  { book: "prop", from: "2010-04-30", to: "2025-07-20", status: "no_pages_exist",
    note: "Prop work in those years was written in the airframe log." },
];

const SCANNED = { initial: "2026-01-10T17:20:00Z", recent: "2026-11-12T15:05:00Z" };

// --- Helpers ----------------------------------------------------------------
function fail(message: string): never {
  console.error(`seed-demo-pages: ${message}`);
  process.exit(1);
}

/** Deterministic UUID (v5 layout) so re-runs upsert the same rows. */
function uid(...parts: string[]): string {
  const h = createHash("sha1").update(`n734dm-demo-pages/${parts.join("/")}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Seeded PRNG so a page renders identically every run. */
function rng(seed: string) {
  let a = parseInt(createHash("sha1").update(seed).digest("hex").slice(0, 8), 16);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Rendering ----------------------------------------------------------------
const IMG_W = 1600, IMG_H = 2100, PAPER_W = 1500, PAPER_H = 1980;
const ROW = 46, FIRST_ROW_Y = 300;
const COL = { date: 30, tach: 210, desc: 380, end: PAPER_W - 30 };
const SHOP = /\b(Inc\.|Co\.|Services|Avionics|Instruments)$/;
const HANDS: Record<string, { font: string; size: number; ink: string; sig: string }> = {
  "D. Alvarez": { font: "Bradley Hand", size: 31, ink: "#1d2f6b", sig: "Savoye LET" },
  "M. Torres": { font: "Noteworthy", size: 28, ink: "#222226", sig: "Snell Roundhand" },
  "R. Mitchell": { font: "Bradley Hand", size: 29, ink: "#2a2a36", sig: "Apple Chancery" },
};
const BOOK_TITLE: Record<Book, string> = {
  airframe: "AIRFRAME LOG", engine: "ENGINE LOG", prop: "PROPELLER LOG", avionics: "AVIONICS LOG",
};
type Box = { x: number; y: number; w: number; h: number };
type Rendered = { jpeg: Buffer; thumb: Buffer; boxes: Map<string, Record<string, Box | null>>; text: string };

function wrap(ctx: SKRSContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const handDate = (d: string) => { const [y, m, day] = d.split("-"); return `${+m}/${+day}/${y.slice(2)}`; };
const typedDate = (d: string) => { const [y, m, day] = d.split("-"); return `${m}/${day}/${y}`; };

async function renderPage(p: PagePlan, entries: Entry[], tail: string): Promise<Rendered> {
  const rand = rng(`${p.book}-${p.seq}`);
  const jit = (n: number) => (rand() - 0.5) * 2 * n;
  const canvas = createCanvas(IMG_W, IMG_H);
  const ctx = canvas.getContext("2d");

  // Table under the page, with a soft light falloff.
  const bg = ctx.createLinearGradient(0, 0, IMG_W, IMG_H);
  bg.addColorStop(0, "#5b4a3a"); bg.addColorStop(1, "#2e251d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, IMG_W, IMG_H);

  const angle = jit(1.3) * Math.PI / 180;
  ctx.translate(IMG_W / 2 + jit(12), IMG_H / 2 + jit(10));
  ctx.rotate(angle);
  ctx.translate(-PAPER_W / 2, -PAPER_H / 2);
  const toImage = ctx.getTransform();

  // Paper: off-white with a shadow, uneven light and fibre speckle.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 38; ctx.shadowOffsetX = 10; ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#efe8d6"; ctx.fillRect(0, 0, PAPER_W, PAPER_H);
  ctx.restore();
  // Older pages have yellowed.
  const age = Math.max(0, 2026 - Math.min(...entries.map((e) => +e.date.slice(0, 4)))) / 48;
  ctx.fillStyle = `rgba(214,184,120,${(age * 0.35).toFixed(3)})`; ctx.fillRect(0, 0, PAPER_W, PAPER_H);
  const light = ctx.createRadialGradient(PAPER_W * 0.35, PAPER_H * 0.3, 100, PAPER_W * 0.5, PAPER_H * 0.5, PAPER_W * 1.1);
  light.addColorStop(0, "rgba(255,253,245,0.55)"); light.addColorStop(1, "rgba(120,100,70,0.22)");
  ctx.fillStyle = light; ctx.fillRect(0, 0, PAPER_W, PAPER_H);
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = `rgba(${90 + rand() * 60},${80 + rand() * 50},${60 + rand() * 40},${rand() * 0.12})`;
    ctx.fillRect(rand() * PAPER_W, rand() * PAPER_H, 1 + rand() * 2, 1 + rand() * 2);
  }
  if (rand() < 0.4) { // a faint coffee ring on some pages
    ctx.strokeStyle = "rgba(140,95,50,0.10)"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(PAPER_W * (0.6 + rand() * 0.3), PAPER_H * (0.75 + rand() * 0.2), 85, 0, Math.PI * 2); ctx.stroke();
  }

  // Printed form.
  ctx.fillStyle = "#3b3f4a";
  ctx.font = "bold 44px 'Times New Roman'";
  ctx.fillText(BOOK_TITLE[p.book], 40, 82);
  ctx.font = "26px 'Times New Roman'";
  ctx.fillText(`Page ${p.seq}`, PAPER_W - 150, 82);
  ctx.font = "22px 'Times New Roman'";
  ctx.fillText("Make", 40, 150); ctx.fillText("Model", 400, 150); ctx.fillText("Serial No.", 680, 150); ctx.fillText("Reg. No.", 1080, 150);
  ctx.strokeStyle = "#8b8f99"; ctx.lineWidth = 1.2;
  for (const [x0, x1] of [[95, 380], [465, 660], [785, 1060], [1170, 1460]]) {
    ctx.beginPath(); ctx.moveTo(x0, 154); ctx.lineTo(x1, 154); ctx.stroke();
  }
  ctx.fillStyle = "#26304f"; ctx.font = "30px 'Bradley Hand'";
  ctx.fillText("Cessna", 110, 146 + jit(2)); ctx.fillText("172N", 480, 146 + jit(2));
  ctx.fillText("17269841", 800, 146 + jit(2)); ctx.fillText(tail, 1185, 146 + jit(2));

  ctx.fillStyle = "#e2dcc9"; ctx.fillRect(COL.date - 10, 205, COL.end - COL.date + 20, 70);
  ctx.fillStyle = "#3b3f4a"; ctx.font = "bold 21px 'Helvetica'";
  ctx.fillText("DATE", COL.date + 40, 247);
  ctx.fillText("TACH TIME", COL.tach + 22, 236); ctx.font = "16px 'Helvetica'"; ctx.fillText("(TOTAL HRS)", COL.tach + 30, 260);
  ctx.font = "bold 19px 'Helvetica'";
  ctx.fillText("DESCRIPTION OF INSPECTIONS, TESTS, REPAIRS, ALTERATIONS, AND SIGNATURE", COL.desc + 20, 247);
  ctx.strokeStyle = "rgba(90,130,170,0.45)"; ctx.lineWidth = 1.3;
  for (let y = FIRST_ROW_Y; y < PAPER_H - 40; y += ROW) { ctx.beginPath(); ctx.moveTo(COL.date - 10, y); ctx.lineTo(COL.end + 10, y); ctx.stroke(); }
  ctx.strokeStyle = "rgba(170,70,70,0.55)"; ctx.lineWidth = 1.6;
  for (const x of [COL.date - 10, COL.tach, COL.desc, COL.end + 10]) { ctx.beginPath(); ctx.moveTo(x, 205); ctx.lineTo(x, PAPER_H - 40); ctx.stroke(); }

  // Entries.
  const boxes = new Map<string, Record<string, Box | null>>();
  const transcript: string[] = [];
  const toFrac = (x: number, y: number, w: number, h: number): Box => {
    const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => toImage.transformPoint({ x: px, y: py }));
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const r = (v: number) => Math.round(v * 10000) / 10000;
    return { x: r(Math.min(...xs) / IMG_W), y: r(Math.min(...ys) / IMG_H), w: r((Math.max(...xs) - Math.min(...xs)) / IMG_W), h: r((Math.max(...ys) - Math.min(...ys)) / IMG_H) };
  };
  const span = (lines: { x: number; y: number; w: number }[], h: number) => {
    if (!lines.length) return null;
    const x0 = Math.min(...lines.map((l) => l.x)), x1 = Math.max(...lines.map((l) => l.x + l.w));
    const y0 = Math.min(...lines.map((l) => l.y)) - h, y1 = Math.max(...lines.map((l) => l.y)) + h * 0.3;
    return toFrac(x0, y0, x1 - x0, y1 - y0);
  };
  /** Handwriting: word by word with a wandering baseline. */
  const scrawl = (text: string, x: number, y: number, slope: number) => {
    let cx = x;
    for (const word of text.split(" ")) {
      ctx.save(); ctx.translate(cx, y + jit(1.6) + (cx - x) * slope); ctx.rotate(jit(0.02));
      ctx.fillText(word, 0, 0); ctx.restore();
      cx += ctx.measureText(`${word} `).width * (0.98 + rand() * 0.06);
    }
    return cx - x;
  };

  let row = 0;
  for (const e of entries) {
    const shop = SHOP.test(e.signer) || e.signer.startsWith("Cessna");
    const b: Record<string, Box | null> = { hobbs: null, parts: null, sb_refs: null, ad_refs: null };
    transcript.push(`${e.date}  ${e.tach.toFixed(1)}\n${e.description}\n${e.work}\n${e.signer}${e.cert ? `  ${e.cert}` : ""}`);
    if (shop) {
      // A typed sticker pasted across the columns, signed with a shop stamp.
      const top = FIRST_ROW_Y + row * ROW + 8, LH = 33, left = COL.date + 4, width = COL.end - COL.date - 8;
      ctx.font = "24px 'Courier New'";
      const desc = wrap(ctx, e.description.toUpperCase(), width - 40);
      const work = wrap(ctx, e.work, width - 40);
      const height = (2 + desc.length + work.length) * LH + 150;
      ctx.save();
      ctx.translate(left + width / 2, top + height / 2); ctx.rotate(jit(0.6) * Math.PI / 180); ctx.translate(-width / 2, -height / 2);
      ctx.shadowColor = "rgba(0,0,0,0.18)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = "#faf8f1"; ctx.fillRect(0, 0, width, height);
      ctx.restore();
      ctx.fillStyle = "#1e1e22"; ctx.font = "24px 'Courier New'";
      let y = top + 40;
      const head = `DATE: ${typedDate(e.date)}   TACH: ${e.tach.toFixed(1)}   ${tail}`;
      ctx.fillText(head, left + 20, y);
      b.entry_date = toFrac(left + 20 + ctx.measureText("DATE: ").width, y - 24, ctx.measureText(typedDate(e.date)).width, 30);
      const tachX = left + 20 + ctx.measureText(`DATE: ${typedDate(e.date)}   TACH: `).width;
      b.tach = toFrac(tachX, y - 24, ctx.measureText(e.tach.toFixed(1)).width, 30);
      y += LH * 1.4;
      const descLines = desc.map((l) => { ctx.fillText(l, left + 20, y); const r = { x: left + 20, y, w: ctx.measureText(l).width }; y += LH; return r; });
      const workLines = work.map((l) => { ctx.fillText(l, left + 20, y); const r = { x: left + 20, y, w: ctx.measureText(l).width }; y += LH; return r; });
      b.description = span(descLines, 24); b.work_performed = span(workLines, 24);
      // Stamp.
      ctx.save();
      const sx = left + width - 520, sy = y + 18;
      ctx.translate(sx + 230, sy + 50); ctx.rotate(jit(3) * Math.PI / 180); ctx.translate(-230, -50);
      ctx.globalAlpha = 0.72; ctx.strokeStyle = "#5a2a7a"; ctx.fillStyle = "#5a2a7a"; ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, 460, 100); ctx.lineWidth = 1.2; ctx.strokeRect(6, 6, 448, 88);
      ctx.font = "bold 26px 'Helvetica'"; ctx.fillText(e.signer.toUpperCase(), 20, 42);
      ctx.font = "20px 'Helvetica'"; ctx.fillText(e.cert ?? "FAA TYPE CERTIFICATE 3A12", 20, 76);
      ctx.restore();
      b.signature_name = toFrac(sx, sy, 460, 60); b.mechanic_cert_number = e.cert ? toFrac(sx, sy + 55, 460, 40) : null;
      ctx.fillStyle = "#1f2a5c"; ctx.font = "44px 'Apple Chancery'";
      scrawl(e.signer.split(" ")[0], left + 60, sy + 70, -0.02);
      row += Math.ceil((height + 16) / ROW) + 1;
    } else {
      const hand = HANDS[e.signer] ?? HANDS["M. Torres"];
      const slope = jit(0.006);
      ctx.fillStyle = hand.ink; ctx.globalAlpha = 0.92;
      ctx.font = `${hand.size}px '${hand.font}'`;
      const base = (r: number) => FIRST_ROW_Y + (r + 1) * ROW - 11;
      const dw = scrawl(handDate(e.date), COL.date + 14 + jit(5), base(row), slope);
      b.entry_date = toFrac(COL.date + 10, base(row) - hand.size, dw + 10, hand.size * 1.3);
      const tw = scrawl(e.tach.toFixed(1), COL.tach + 18 + jit(5), base(row), slope);
      b.tach = toFrac(COL.tach + 14, base(row) - hand.size, tw + 10, hand.size * 1.3);
      const width = COL.end - COL.desc - 40;
      const lineAt = (text: string, r: number) => { const x = COL.desc + 16 + jit(4); return { x, y: base(r), w: scrawl(text, x, base(r), slope) }; };
      const descLines = wrap(ctx, e.description, width).map((l) => lineAt(l, row++));
      const workLines = wrap(ctx, e.work, width).map((l) => lineAt(l, row++));
      b.description = span(descLines, hand.size); b.work_performed = span(workLines, hand.size);
      ctx.font = `46px '${hand.sig}'`;
      const sigX = COL.desc + 420 + jit(30);
      const sw = scrawl(e.signer, sigX, base(row) + 4, slope);
      b.signature_name = toFrac(sigX, base(row) - 40, sw, 54);
      ctx.font = `${hand.size}px '${hand.font}'`;
      const cw = scrawl(e.cert ?? "", sigX + sw + 24, base(row), slope);
      b.mechanic_cert_number = e.cert ? toFrac(sigX + sw + 20, base(row) - hand.size, cw + 8, hand.size * 1.3) : null;
      ctx.globalAlpha = 1;
      row += 2;
    }
    boxes.set(e.key, b);
  }

  // Phone camera: a touch of blur and JPEG.
  const png = await canvas.encode("png");
  const jpeg = await sharp(png).blur(0.55).modulate({ brightness: 1.02, saturation: 0.92 }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  const thumb = await sharp(jpeg).resize(320, 320, { fit: "inside" }).jpeg({ quality: 60 }).toBuffer();
  return { jpeg, thumb, boxes, text: transcript.join("\n\n") };
}

// --- Main -----------------------------------------------------------------
async function main() {
  const outIdx = process.argv.indexOf("--out");
  const outDir = outIdx > 0 ? process.argv[outIdx + 1] : null;
  if (outIdx > 0 && !outDir) fail("--out needs a directory");

  if (new URL(SUPABASE_URL).hostname !== `${TEST_REF}.supabase.co`) fail("refusing: not the TEST project");
  const keys = JSON.parse(execFileSync("supabase", ["projects", "api-keys", "--project-ref", TEST_REF, "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) as { name: string; api_key: string }[];
  const serviceKey = keys.find((k) => k.name === "service_role")?.api_key;
  if (!serviceKey) fail("no service_role key from `supabase projects api-keys` (is the CLI logged in?)");
  const db = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: acs, error: acErr } = await db.from("aircraft").select("id, owner_id, tail_number").eq("is_demo", true).eq("tail_number", "N734DM");
  if (acErr) fail(acErr.message);
  if (acs?.length !== 1) fail(`expected exactly one is_demo N734DM aircraft, found ${acs?.length ?? 0}`);
  const ac = acs[0] as { id: string; owner_id: string; tail_number: string };
  const A = ac.id;

  const { data: books } = await db.from("logbook").select("id, type").eq("aircraft_id", A);
  const bookId = new Map((books ?? []).map((b: { id: string; type: string }) => [b.type, b.id]));
  const { data: rows } = await db.from("log_entry").select("id, logbook_id, entry_date, tach, description, work_performed, signature_name, mechanic_cert_number, ad_refs, page_id").eq("aircraft_id", A);
  type Row = { id: string; logbook_id: string; entry_date: string; tach: number; description: string; work_performed: string; signature_name: string; mechanic_cert_number: string | null; ad_refs: string[] };
  const typeOf = new Map([...bookId].map(([t, id]) => [id, t]));
  const ours = new Set(PLAN.flatMap((p) => (p.fresh ?? []).map((e) => uid(A, "entry", e.key))));
  const existing = new Map<string, Row>();
  for (const r of (rows ?? []) as Row[]) if (!ours.has(r.id)) existing.set(`${typeOf.get(r.logbook_id)}:${r.entry_date}`, r);
  const entryId = (key: string) => key.startsWith("new:") ? uid(A, "entry", key) : existing.get(key)?.id;

  const pageRows: Record<string, unknown>[] = [];
  const entryRows: Record<string, unknown>[] = [];
  const links: { id: string; page_id: string; entry_index: number; field_boxes: unknown }[] = [];
  const batches = new Map<string, { book: Book; batch: string; pages: number; done: boolean }>();

  for (const p of PLAN) {
    const lb = bookId.get(p.book);
    if (!lb) fail(`no ${p.book} logbook on the demo aircraft`);
    const pageId = uid(A, "page", p.book, String(p.seq));
    const ex = (p.existing ?? []).map((d): Entry => {
      const r = existing.get(`${p.book}:${d}`);
      if (!r) fail(`no existing ${p.book} entry dated ${d}; run seed-demo.sql first`);
      return { key: `${p.book}:${d}`, date: d, tach: Number(r.tach), description: r.description, work: r.work_performed,
        signer: r.signature_name, cert: r.mechanic_cert_number };
    });
    const drawn = [...ex, ...(p.fresh ?? [])];
    const img = await renderPage(p, drawn, ac.tail_number);
    const path = `${A}/${lb}/${pageId}.jpg`;
    const thumbPath = `${A}/${lb}/${pageId}_thumb.jpg`;
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, `${p.book}-p${p.seq}.jpg`), img.jpeg);
      continue;
    }
    for (const [key, body] of [[path, img.jpeg], [thumbPath, img.thumb]] as const) {
      const { error } = await db.storage.from(BUCKET).upload(key, body, { contentType: "image/jpeg", upsert: true });
      if (error) fail(`upload ${key}: ${error.message}`);
    }

    const batchKey = `${p.book}:${p.batch}`;
    const bt = batches.get(batchKey) ?? { book: p.book, batch: p.batch, pages: 0, done: true };
    bt.pages++; bt.done &&= p.status !== "queued"; batches.set(batchKey, bt);

    const read = p.status !== "queued";
    const confs = drawn.map((e) => e.confidence ?? 0.97);
    pageRows.push({
      id: pageId, logbook_id: lb, aircraft_id: A, storage_path: path, thumbnail_path: thumbPath,
      page_sequence: p.seq, captured_at: SCANNED[p.batch], created_at: SCANNED[p.batch], is_handwritten: true,
      batch_id: uid(A, "batch", batchKey),
      extraction_status: read ? "extracted" : "queued", extraction_error: null,
      extracted_at: read ? SCANNED[p.batch] : null,
      review_status: p.status === "confirmed" ? "confirmed" : "unreviewed",
      ocr_text: read ? img.text : null, extraction_confidence: read ? Math.min(...confs) : null,
      detected_page_count: read ? 1 : null, unread_rotated_content: false,
      needs_look: read ? drawn.some((e) => Object.values(e.weak ?? {}).some((c) => c < 0.75)) : null,
      landing_date: read ? drawn.map((e) => e.date).sort()[0] : null,
    });
    if (!read) continue;
    ex.forEach((e, i) => links.push({ id: existing.get(e.key)!.id, page_id: pageId, entry_index: i, field_boxes: img.boxes.get(e.key) }));
    (p.fresh ?? []).forEach((e, i) => {
      const overall = e.confidence ?? 0.95;
      const fc: Record<string, number> = {};
      for (const f of ["entry_date", "hobbs", "tach", "description", "work_performed", "parts", "signature_name", "mechanic_cert_number", "ad_refs", "sb_refs"]) fc[f] = e.weak?.[f] ?? overall;
      entryRows.push({
        id: uid(A, "entry", e.key), page_id: pageId, logbook_id: lb, aircraft_id: A, entry_index: ex.length + i,
        entry_date: e.date, tach: e.tach, description: e.description, work_performed: e.work,
        signature_name: e.signer, mechanic_cert_number: e.cert, ad_refs: e.adRefs ?? [], sb_refs: [],
        confidence: overall, field_confidence: fc, field_boxes: img.boxes.get(e.key),
        extraction_schema_version: SCHEMA_VERSION, extraction_model: MODEL, owner_confirmed: false,
        entry_kind: e.kind ?? null, continues_next: false, is_continuation: false,
      });
    });
  }
  if (outDir) { console.log(`Rendered ${PLAN.length} pages to ${outDir}`); return; }

  const up = async (table: string, values: Record<string, unknown>[]) => {
    const { error } = await db.from(table).upsert(values, { onConflict: "id" });
    if (error) fail(`${table}: ${error.message}`);
  };
  await up("scan_batch", [...batches].map(([k, b]) => ({
    id: uid(A, "batch", k), aircraft_id: A, logbook_id: bookId.get(b.book), source: "phone_camera",
    expected_pages: b.pages, is_handwritten: true, created_by: ac.owner_id, created_at: SCANNED[b.batch as "initial" | "recent"],
    completed_at: b.done ? SCANNED[b.batch as "initial" | "recent"] : null, notified_at: b.done ? SCANNED[b.batch as "initial" | "recent"] : null,
  })));
  await up("page", pageRows);
  await up("log_entry", entryRows);
  for (const l of links) {
    const { error } = await db.from("log_entry").update({ page_id: l.page_id, entry_index: l.entry_index, field_boxes: l.field_boxes }).eq("id", l.id).eq("aircraft_id", A);
    if (error) fail(`link entry ${l.id}: ${error.message}`);
  }

  // Completions.
  const { data: items } = await db.from("maintenance_item").select("id, kind").eq("aircraft_id", A);
  const { data: ads } = await db.from("ad_compliance").select("id, reference").eq("aircraft_id", A);
  const itemId = new Map((items ?? []).map((i: { id: string; kind: string }) => [i.kind, i.id]));
  const adId = new Map((ads ?? []).map((d: { id: string; reference: string }) => [`ad:${d.reference}`, d.id]));
  const entryByKey = new Map<string, { date: string; tach: number }>();
  for (const [k, r] of existing) entryByKey.set(k, { date: r.entry_date, tach: Number(r.tach) });
  for (const p of PLAN) for (const e of p.fresh ?? []) entryByKey.set(e.key, e);
  const newCompletions: Record<string, unknown>[] = [];
  for (const [target, key] of COMPLETIONS) {
    const isAd = target.startsWith("ad:");
    const parent = isAd ? adId.get(target) : itemId.get(target);
    const e = entryByKey.get(key);
    const eid = entryId(key);
    if (!parent || !e || !eid) fail(`completion ${target} -> ${key}: missing item or entry`);
    const col = isAd ? "ad_compliance_id" : "maintenance_item_id";
    // The 0070 back-fill left one 'import' row per item with no entry; link it rather than add a twin.
    const { data: linked, error } = await db.from("item_completion").update({ log_entry_id: eid })
      .eq("aircraft_id", A).eq(col, parent).eq("source", "import").eq("done_date", e.date).is("log_entry_id", null).select("id");
    if (error) fail(`link completion: ${error.message}`);
    if (linked?.length) continue;
    const { data: already } = await db.from("item_completion").select("id").eq(col, parent).eq("log_entry_id", eid).eq("source", "import");
    if (already?.length) continue;
    newCompletions.push({
      id: uid(A, "completion", target, key), aircraft_id: A, [col]: parent, log_entry_id: eid,
      done_date: e.date, done_hours: e.tach, meter: "tach", source: "extraction", created_by: ac.owner_id,
    });
  }
  await up("item_completion", newCompletions);

  await up("logbook_gap", GAPS.map((g) => ({
    id: uid(A, "gap", g.book, g.from), aircraft_id: A, logbook_id: bookId.get(g.book), from_date: g.from, to_date: g.to,
    status: g.status, source: "coverage_rule", note: g.note ?? null,
    status_set_by: g.status === "open" ? null : ac.owner_id, status_set_at: g.status === "open" ? null : SCANNED.initial,
  })));

  console.log(`N734DM (${A}): ${pageRows.length} pages, ${links.length} entries linked, ${entryRows.length} AI-read entries, ` +
    `${newCompletions.length} completions added (+ import rows linked), ${GAPS.length} gaps, ${batches.size} batches.`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

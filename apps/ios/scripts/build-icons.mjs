// Writes the Lucide glyphs the app uses into the asset catalog as template SVGs (01 §8, 02 §2.6).
// Source: lucide-react 0.469.0 from apps/web/node_modules (run `pnpm install` in apps/web first).
// Usage: node apps/ios/scripts/build-icons.mjs  (LUCIDE_ICONS=<dir> to point at another install)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lucide = process.env.LUCIDE_ICONS ?? join(here, "../../web/node_modules/lucide-react/dist/esm/icons");
const out = join(here, "../MyTailLog/Resources/Assets.xcassets/Icons");
const ICONS = ["list-checks", "book-open", "wrench", "plane", "file-text", "share-2", "chevron-down", "chevrons-up-down", "mail", "key-round", "circle-user-round", "chevron-right", "chevron-left", "calendar", "gauge", "x", "chevron-up", "circle-help", "list", "zoom-in", "pencil", "check"];

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "Contents.json"), JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n");
for (const name of ICONS) {
  const src = readFileSync(join(lucide, `${name}.js`), "utf8");
  // Each node is ["tag", { attr: "value", ..., key: "..." }]
  const nodes = [...src.matchAll(/\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]/g)].map(([, tag, attrs]) => {
    const pairs = [...attrs.matchAll(/(\w+): "([^"]*)"/g)].filter(([, k]) => k !== "key");
    return `<${tag} ${pairs.map(([, k, v]) => `${k}="${v}"`).join(" ")}/>`;
  });
  if (!nodes.length) throw new Error(`no paths parsed for ${name}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${nodes.join("")}</svg>\n`;
  const dir = join(out, `${name}.imageset`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.svg`), svg);
  writeFileSync(join(dir, "Contents.json"), JSON.stringify({
    images: [{ filename: `${name}.svg`, idiom: "universal" }],
    info: { author: "xcode", version: 1 },
    properties: { "preserves-vector-representation": true, "template-rendering-intent": "template" },
  }, null, 2) + "\n");
}
console.log(`wrote ${ICONS.length} icons to ${out}`);

// Build labelled pairs for P3 from REAL Target listings read by Apify (the frozen watch list's latest dataset).
// Labels are true by construction, so the set is "curated" and is reported apart from wild data:
//   exact          the receipt line is a cryptic version of that same listing
//   other_variant  the same line with its size or capacity changed (6 qt against 8 qt)
//   other_product  a line made from a different listing (hard cases: others in the same category)
// A fixed seed makes it reproducible. Output: evidence/labels/pairs.json
//   APIFY_TOKEN=... node scripts/build-pairs.mjs [datasetId]
import { writeFileSync, mkdirSync } from "node:fs";
import { need } from "./lib/api.mjs";

need("APIFY_TOKEN");
const ds = process.argv[2] ?? process.env.SALVOR_PAIRS_DATASET;
if (!ds) { console.error("give a dataset id (the id of the baseline watch run's dataset)"); process.exit(2); }
const rows = await (await fetch(`https://api.apify.com/v2/datasets/${ds}/items?clean=true&limit=200`, { headers: { authorization: `Bearer ${process.env.APIFY_TOKEN}` } })).json();
const listings = rows.filter((r) => r.name && r.offers?.price != null).map((r, i) => ({ id: `L${String(i + 1).padStart(2, "0")}`, title: String(r.name), brand: r.brand?.name ?? null, url: r.url }));

const FILLER = new Set(["with", "and", "the", "a", "for", "of", "in", "black", "white", "stainless", "steel", "finish", "color", "pack", "guided", "cooking", "prompts", "digital", "slim", "functions"]);
const abbreviate = (t) => {
  const w = t.replace(/\b(\d+(?:\.\d+)?)\s?(quarts?|qt)\b/gi, "$1QT").replace(/[^A-Za-z0-9. ]+/g, " ").split(/\s+/).filter(Boolean);
  const keep = w.filter((x, i) => i < 2 || /\d/.test(x) || !FILLER.has(x.toLowerCase())).slice(0, 5);
  return keep.join(" ").toUpperCase();
};
const bump = (line) => line.replace(/(\d+(?:\.\d+)?)(QT|OZ|IN|LB|CT|PK)/i, (_, n, u) => `${Number(n) + (Number(n) >= 6 ? 2 : 1)}${u}`);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (n, arr) => { const a = [...arr]; const out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };

const listingFields = (l) => ({ title: l.title, brand: l.brand, variant: null, sku: null, seller: "Target", in_stock: null });
const pairs = [];
for (const l of listings) {
  const line = abbreviate(l.title);
  pairs.push({ id: `${l.id}-exact`, origin: "curated", line, listing: listingFields(l), label: "exact" });
  if (/\d(QT|OZ|IN|LB|CT|PK)\b/i.test(line)) pairs.push({ id: `${l.id}-variant`, origin: "curated", line: bump(line), listing: listingFields(l), label: "other_variant" });
  for (const o of pick(3, listings.filter((x) => x.id !== l.id))) pairs.push({ id: `${l.id}-vs-${o.id}`, origin: "curated", line: abbreviate(o.title), listing: listingFields(l), label: "other_product" });
}
mkdirSync("evidence/labels", { recursive: true });
writeFileSync("evidence/labels/pairs.json", JSON.stringify(pairs, null, 1));
const c = pairs.reduce((a, p) => ((a[p.label] = (a[p.label] ?? 0) + 1), a), {});
console.log(`${listings.length} real listings -> ${pairs.length} pairs`, c);

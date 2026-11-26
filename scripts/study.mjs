// P1 early-buyer study. Reads the FROZEN item list, asks Apify for each item's current price and
// for an early-November price from an archived copy, and writes p1_item records. Misses are kept
// with their reason. The list is frozen and hashed before any price is read.
//   APIFY_TOKEN=... node scripts/study.mjs evidence/labels/p1-items.json
// p1-items.json: [{id, url}]. The first run writes evidence/labels/p1-items.sha256; later runs refuse to run if it changed.
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { need } from "./lib/api.mjs";
import { normalizeListing } from "../src/connectors/apify.ts";

need("APIFY_TOKEN");
const file = process.argv[2] ?? "evidence/labels/p1-items.json";
const text = readFileSync(file, "utf8");
const hash = createHash("sha256").update(text).digest("hex");
const hf = "evidence/labels/p1-items.sha256";
if (existsSync(hf)) { if (readFileSync(hf, "utf8").trim() !== hash) { console.error("the item list changed after it was frozen; refusing to run"); process.exit(1); } }
else { writeFileSync(hf, hash + "\n"); console.log(`froze the item list: sha256 ${hash}`); }
const items = JSON.parse(text);

const ACTOR = (process.env.SALVOR_APIFY_ACTOR ?? "apify/e-commerce-scraping-tool").replace("/", "~");
const ARCHIVE_DATE = process.env.SALVOR_ARCHIVE_DATE ?? "20261105";
const api = async (urls) => {
  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=240&clean=true`, {
    method: "POST", headers: { authorization: `Bearer ${process.env.APIFY_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ detailsUrls: urls.map((url) => ({ url })), listingUrls: [], scrapeMode: "AUTO" }), signal: AbortSignal.timeout(280_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
};
const priceOf = (it) => { try { return normalizeListing(it, new Date().toISOString()).price_cents; } catch { return null; } };

mkdirSync("evidence/runs", { recursive: true });
const out = "evidence/runs/p1.jsonl";
const nowAt = new Date().toISOString();
let nowItems = [], archItems = [], nowErr = null, archErr = null;
try { nowItems = await api(items.map((i) => i.url)); } catch (e) { nowErr = e.message; }
try { archItems = await api(items.map((i) => `https://web.archive.org/web/${ARCHIVE_DATE}/${i.url}`)); } catch (e) { archErr = e.message; }
const find = (arr, url) => arr.find((x) => String(x.url ?? x.inputUrl ?? "").includes(url.split("/A-")[1]?.split(/[?#]/)[0] ?? "\u0000"));
for (const i of items) {
  const now = find(nowItems, i.url), arch = find(archItems, i.url);
  const nowC = now ? priceOf(now) : null, archC = arch ? priceOf(arch) : null;
  const reason = nowErr ? `current read failed: ${nowErr}` : archErr && archC === null ? `archive read failed: ${archErr}` : nowC === null ? "no readable current price" : archC === null ? "no archived page with a readable price" : null;
  appendFileSync(out, JSON.stringify({ kind: "p1_item", id: i.id, url: i.url, archive_cents: archC, archive_date: ARCHIVE_DATE, now_cents: nowC, now_at: nowAt, reason }) + "\n");
}
console.log(`wrote ${items.length} p1_item records to ${out}. Next: node scripts/facts.mjs`);

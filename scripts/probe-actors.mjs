// Q9: choose the Apify actor by measured completeness, not by name. Runs each candidate on the same
// product URLs and counts how many of the fields Salvor needs it returns. Needs APIFY_TOKEN (local).
//   APIFY_TOKEN=... node scripts/probe-actors.mjs [urls.json]
// urls.json: an array of product URLs. Without it, product URLs are discovered from a search page.
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { need, writeJson } from "./lib/api.mjs";
import { normalizeListing } from "../src/connectors/apify.ts";

need("APIFY_TOKEN");
const API = "https://api.apify.com/v2";
const H = { authorization: `Bearer ${process.env.APIFY_TOKEN}`, "content-type": "application/json" };
const CANDIDATES = (process.env.SALVOR_ACTOR_CANDIDATES ?? "apify/e-commerce-scraping-tool,apify/web-scraper").split(",");

async function runSync(actor, input) {
  const t0 = Date.now();
  const r = await fetch(`${API}/acts/${actor.replace("/", "~")}/run-sync-get-dataset-items?timeout=180&clean=true`, { method: "POST", headers: H, body: JSON.stringify(input), signal: AbortSignal.timeout(220_000) });
  const text = await r.text();
  return { status: r.status, ms: Date.now() - t0, items: r.ok ? JSON.parse(text) : [], error: r.ok ? null : text.slice(0, 200), runId: r.headers.get("x-apify-run-id") };
}
async function cost(runId) {
  if (!runId) return null;
  const r = await fetch(`${API}/actor-runs/${runId}`, { headers: H });
  return (await r.json().catch(() => ({})))?.data?.usageTotalUsd ?? null;
}

let urls = existsSync(process.argv[2] ?? "") ? JSON.parse(readFileSync(process.argv[2], "utf8")) : [];
if (!urls.length) {
  const s = await runSync(CANDIDATES[0], { listingUrls: [{ url: "https://www.target.com/s?searchTerm=air+fryer" }], detailsUrls: [], scrapeMode: "AUTO", maxProductResults: 12 });
  urls = s.items.map((i) => i.url).filter((u) => /target\.com\/p\//.test(u ?? "")).slice(0, 10);
  console.log(`discovered ${urls.length} product URLs from search (${s.status})`);
}

const report = { at: new Date().toISOString(), urls, candidates: {} };
for (const actor of CANDIDATES) {
  const input = actor.includes("e-commerce") ? { detailsUrls: urls.map((url) => ({ url })), listingUrls: [], scrapeMode: "AUTO" } : { startUrls: urls.map((url) => ({ url })) };
  const r = await runSync(actor, input);
  const fields = { price: 0, regular: 0, seller: 0, availability: 0, title: 0, brand: 0, variant: 0, sku: 0 };
  let readable = 0;
  for (const it of r.items) {
    try {
      const l = normalizeListing(it, new Date().toISOString());
      readable++;
      if (l.price_cents !== null) fields.price++; if (l.regular_cents !== null) fields.regular++; if (it.seller || it.soldBy || it.offers?.seller) fields.seller++;
      if (l.in_stock !== null) fields.availability++; if (l.title) fields.title++; if (l.brand) fields.brand++; if (l.variant) fields.variant++; if (l.sku) fields.sku++;
    } catch { /* counted as unreadable */ }
  }
  const usd = await cost(r.runId);
  report.candidates[actor] = { http: r.status, ms: r.ms, error: r.error, returned: r.items.length, readable, success_rate: urls.length ? readable / urls.length : 0, fields, usd_total: usd, usd_per_result: usd && r.items.length ? usd / r.items.length : null, sample_keys: r.items[0] ? Object.keys(r.items[0]).slice(0, 40) : [] };
  console.log(`${actor}: ${readable}/${urls.length} readable, ${JSON.stringify(fields)}, usd/result ${report.candidates[actor].usd_per_result}`);
}
mkdirSync("evidence/probe", { recursive: true });
writeJson(`evidence/probe/actors-${report.at.slice(0, 10)}.json`, report);
const best = Object.entries(report.candidates).sort((a, b) => b[1].readable - a[1].readable || (a[1].usd_per_result ?? 9) - (b[1].usd_per_result ?? 9))[0];
console.log(`\nbest by measured completeness: ${best?.[0]}`);
writeFileSync("evidence/probe/actor-choice.txt", `${best?.[0] ?? ""}\n`);

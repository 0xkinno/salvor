// Runs inside a receipt Sprite. Two jobs that need the web (through Apify) but no secrets:
//   resolve: a cryptic receipt line -> candidate listings, ranked by Pinecone
//   trynew:  read one URL for a visitor's own receipt (P6)
import { writeFileSync, mkdirSync } from "node:fs";
import { runSync, normalizeListing, canonicalUrl, type ListingFields } from "../connectors/apify.ts";
import { pickBest, recallItem } from "../connectors/pinecone.ts";
import { readJob, decideFromItems, writeReport, type Job, type Report } from "./observe.ts";
import { DIR } from "./evidence.ts";

// The actor and its input are chosen by the probe (Q9) and passed in the environment so the
// code never hard-codes an actor it has not measured.
const ACTOR = () => process.env.SALVOR_APIFY_ACTOR ?? "apify/e-commerce-scraping-tool";
const INPUT_TEMPLATE = () =>
  process.env.SALVOR_APIFY_INPUT ?? '{"detailsUrls":[{"url":"{{url}}"}],"listingUrls":[],"scrapeMode":"AUTO","maxProductResults":1}';
const SEARCH_TEMPLATE = () =>
  process.env.SALVOR_APIFY_SEARCH_INPUT ?? '{"listingUrls":[{"url":"{{url}}"}],"detailsUrls":[],"scrapeMode":"AUTO","maxProductResults":8}';

const fill = (tpl: string, url: string) => JSON.parse(tpl.replace("{{url}}", url.replace(/"/g, "%22")));

export function searchUrl(retailer: Job["retailer"], rawLine: string): string {
  const q = rawLine.replace(/[^A-Za-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return retailer === "target"
    ? `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`
    : `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`;
}

export type Candidate = { id: string; title: string; brand: string | null; url: string | null; price_cents: number; score: number };

export async function resolve(): Promise<{ candidates: Candidate[]; remembered: unknown; actor: string }> {
  const job = readJob();
  const remembered = await recallItem(job.line.raw_text).catch(() => null);
  const { items } = await runSync(ACTOR(), fill(SEARCH_TEMPLATE(), searchUrl(job.retailer, job.line.raw_text)));
  const listings: (ListingFields & { id: string })[] = [];
  items.forEach((it, i) => { try { listings.push({ ...normalizeListing(it, new Date().toISOString()), id: String(i) }); } catch { /* skip unreadable items */ } });
  if (!listings.length) return { candidates: [], remembered, actor: ACTOR() };
  const ranked = await pickBest(job.line, listings);
  const byId = new Map(listings.map((l) => [l.id, l]));
  const candidates = ranked.slice(0, 3).map((r) => {
    const l = byId.get(r.id)!;
    return { id: r.id, title: l.title, brand: l.brand, url: l.url ? canonicalUrl(l.url) : null, price_cents: l.price_cents, score: r.score };
  });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/candidates.json`, JSON.stringify(candidates));
  return { candidates, remembered, actor: ACTOR() };
}

// P6: one live observation of a URL the visitor gave us. Reads the page through Apify, runs the
// same decision code, and returns typed fields. Nothing about the visitor is kept beyond the hour.
export async function trynew(url: string, paid_cents: number, purchased_date: string, retailer: Job["retailer"]): Promise<Report> {
  const t0 = new Date().toISOString();
  const job: Job = {
    id: "try", sprite: process.env.SPRITE_NAME ?? "slv-try", listing_url: url, retailer,
    line: { raw_text: "visitor receipt", paid_cents, qty: 1 }, clause: { id: "target-holiday-2026", text: "" },
  };
  const finish = (r: any): Report => { const full = { job_id: "try", run_id: `try-${Date.now()}`, observed_at: t0, sabotage: "none", calls: [], ...r } as Report; writeReport(full); return full; };
  const { items, runId } = await runSync(ACTOR(), fill(INPUT_TEMPLATE(), url));
  if (!items.length) return finish({ decision: "stale", reason: "the page returned nothing readable" });
  return decideFromItems(job, items, runId ?? `try-${Date.now()}`, "direct", t0, finish);
}

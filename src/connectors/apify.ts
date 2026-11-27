// Apify: the eyes on store pages and the clock. Called from receipt Sprites (reads) through the
// "apify-eyes" connection, and from slv-home for run bookkeeping. The Apify token never reaches a Sprite.
import { json, call } from "../gateway.ts";
import { parseCents } from "../policy/money.ts";
import type { Exclusion } from "../policy/clauses.ts";
import type { TypedListing } from "../policy/engine.ts";

const CONN = "apify-eyes";
const HISTORY = "apify-history";   // custom connector: the dedicated one refuses task run lists

export type RawItem = Record<string, any>;

// Run an actor and get the items back in one request (used by the study and by /try).
export async function runSync(actor: string, input: unknown, timeoutSecs = 120): Promise<{ items: RawItem[]; runId: string | null }> {
  const id = actor.replace("/", "~");
  const r = await call("apify-run", "POST", `/v2/acts/${id}/run-sync-get-dataset-items?timeout=${timeoutSecs}&clean=true`, input, {
    signal: AbortSignal.timeout((timeoutSecs + 30) * 1000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`apify run-sync HTTP ${r.status}: ${text.slice(0, 240)}`);
  return { items: JSON.parse(text), runId: r.headers.get("x-apify-run-id") };
}

export async function datasetItems(datasetId: string, limit = 500): Promise<RawItem[]> {
  return json<RawItem[]>(CONN, "GET", `/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&limit=${limit}`);
}

export async function runInfo(runId: string) {
  return json<{ data: { id: string; status: string; defaultDatasetId: string; usageTotalUsd?: number; startedAt?: string; finishedAt?: string } }>(
    CONN, "GET", `/v2/actor-runs/${encodeURIComponent(runId)}`);
}

// ---- normalising an actor item into typed fields ------------------------------------------
// Different actors name their fields differently. The candidates below are tried in order and
// the first usable value wins. A missing price throws: nothing is defaulted. The chosen actor
// and the exact mapping it needed are recorded in PLATFORM_PROBE.md.
const PRICE_PATHS = [
  "price_cents", "offers.price", "offers.0.price", "price.current_retail", "price.currentPrice", "price.current", "price.value",
  "currentPrice", "current_price", "salePrice", "sale_price", "price",
];
const REGULAR_PATHS = [
  "regular_cents", "price.reg_retail", "price.regularPrice", "price.regular", "regularPrice", "regular_price", "listPrice",
  "list_price", "wasPrice", "was_price", "offers.highPrice", "offers.regularPrice", "originalPrice",
];

function dig(o: any, path: string): unknown {
  let cur = o;
  for (const k of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = Array.isArray(cur) ? cur[Number(k)] : cur[k];
  }
  return cur;
}

function toCents(v: unknown, path: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  if (path === "price_cents" || path === "regular_cents") return typeof v === "number" && Number.isInteger(v) ? v : null;
  try { return parseCents(typeof v === "number" || typeof v === "string" ? v : String((v as any)?.value ?? "")); } catch { return null; }
}

function firstCents(item: RawItem, paths: string[]): number | null {
  for (const p of paths) { const c = toCents(dig(item, p), p); if (c !== null) return c; }
  return null;
}

const FLAG_PATTERNS: [RegExp, Exclusion][] = [
  [/clearance/i, "clearance"], [/closeout|close-out/i, "closeout"], [/liquidation/i, "liquidation"],
  [/refurbished|renewed/i, "refurbished"], [/open[- ]box|open package/i, "open_package"], [/pre-?owned|used\b/i, "pre_owned"],
  [/pre-?order/i, "preorder"], [/bundle/i, "bundle"], [/limited quantity|limit \d+ per/i, "limited_quantity"], [/doorbuster/i, "doorbuster"],
];

export type ListingFields = TypedListing & {
  title: string; brand: string | null; variant: string | null; sku: string | null; url: string | null;
};

export function normalizeListing(item: RawItem, observedAt: string, retailerSeller = "Target"): ListingFields {
  const price = firstCents(item, PRICE_PATHS);
  if (price === null) throw new Error("listing has no readable price");
  const regular = firstCents(item, REGULAR_PATHS);
  const title = String(item.title ?? item.name ?? dig(item, "item.product_description.title") ?? "").slice(0, 300);
  if (!title) throw new Error("listing has no title");
  const sellerRaw = item.seller ?? item.soldBy ?? dig(item, "offers.seller.name") ?? dig(item, "offers.0.seller.name") ?? dig(item, "fulfillment.sold_by") ?? null;
  const availability = String(dig(item, "offers.availability") ?? item.availability ?? item.inStock ?? "").toLowerCase();
  const inStock = availability === "" ? null : /instock|in stock|available|true/.test(availability) ? true : /out|false|soldout|unavailable/.test(availability) ? false : null;
  // Flags come from short structured badge fields and the title only, never from long page text.
  const badge = [item.badges, item.promotion, item.condition, item.itemCondition, dig(item, "offers.itemCondition"), title].flat().filter((x) => typeof x === "string").join(" | ");
  const flags: Exclusion[] = [];
  for (const [re, f] of FLAG_PATTERNS) if (re.test(badge) && !flags.includes(f)) flags.push(f);
  return {
    price_cents: price, regular_cents: regular, title,
    brand: typeof item.brand === "string" ? item.brand : (item.brand?.name ?? null),
    variant: item.variant ? String(item.variant).slice(0, 120) : null,
    sku: item.sku ?? item.tcin ?? item.productId ?? item.gtin ?? null,
    url: item.url ?? item.productUrl ?? null,
    seller: sellerRaw === null ? retailerSeller : String(sellerRaw).slice(0, 80),
    in_stock: inStock, flags, observed_at: observedAt,
  };
}

export function itemUrl(item: RawItem): string | null {
  const u = item.url ?? item.productUrl ?? item.inputUrl ?? item.startUrl ?? null;
  return typeof u === "string" ? u : null;
}

// Canonical form so a dataset item can be matched to a receipt's listing URL.
export function canonicalUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = ""; x.search = "";
    return (x.origin + x.pathname).replace(/\/+$/, "").toLowerCase();
  } catch { return u.toLowerCase(); }
}

export async function datasetItemsFor(datasetId: string, listingUrl: string): Promise<RawItem[]> {
  const want = canonicalUrl(listingUrl);
  const tcin = /A-(\d{6,10})/.exec(listingUrl)?.[1];
  const items = await datasetItems(datasetId);
  return items.filter((it) => {
    const u = itemUrl(it);
    if (u && canonicalUrl(u) === want) return true;
    return tcin ? JSON.stringify(it.url ?? it.inputUrl ?? it.tcin ?? "").includes(tcin) : false;
  });
}

// Newest successful run of the scheduled task. Used by the backup knock path.
export async function lastRun(taskId: string): Promise<{ id: string; defaultDatasetId: string; finishedAt: string | null }> {
  const j = await json<{ data: { id: string; defaultDatasetId: string; finishedAt?: string } }>(HISTORY, "GET", `/v2/actor-tasks/${encodeURIComponent(taskId)}/runs/last?status=SUCCEEDED`);
  return { id: j.data.id, defaultDatasetId: j.data.defaultDatasetId, finishedAt: j.data.finishedAt ?? null };
}

// Run history of the scheduled task, for the live watch summary (read from inside an eyes Sprite).
export async function listRuns(taskId: string): Promise<{ id: string; status: string; startedAt: string; finishedAt: string | null; defaultDatasetId: string }[]> {
  const j = await json<{ data: { items: any[] } }>(HISTORY, "GET", `/v2/actor-tasks/${encodeURIComponent(taskId)}/runs?limit=100&desc=0`);
  return j.data.items;
}
export async function runOrigin(runId: string): Promise<{ origin: string; usd: number | null }> {
  const j = await json<{ data: any }>(CONN, "GET", `/v2/actor-runs/${encodeURIComponent(runId)}`);
  return { origin: j.data.meta?.origin ?? j.data.origin ?? "unknown", usd: j.data.usageTotalUsd ?? null };
}

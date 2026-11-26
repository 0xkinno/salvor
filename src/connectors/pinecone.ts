// Pinecone: turns a cryptic receipt line into the right listing (embed + rerank), and keeps a
// household memory of items Teresa confirmed. Reads happen in receipt Sprites ("pinecone-read"),
// writes only on slv-home ("pinecone-write"). Different connections, different labels.
import { call, base } from "../gateway.ts";

const READ = "pinecone-read";
const WRITE = "pinecone-write";
const API_VERSION = "2025-10";
const hdr = { "x-pinecone-api-version": API_VERSION };

export const EMBED_MODEL = process.env.PINECONE_EMBED_MODEL ?? "multilingual-e5-large";
export const RERANK_MODEL = process.env.PINECONE_RERANK_MODEL ?? "bge-reranker-v2-m3";

// Pinecone answers 429 or 5xx now and then under load; two short retries keep a reading from failing for that.
async function withRetry(f: () => Promise<Response>): Promise<Response> {
  let r = await f();
  for (let i = 0; i < 2 && (r.status === 429 || r.status >= 500); i++) { await new Promise((x) => setTimeout(x, 400 * (i + 1))); r = await f(); }
  return r;
}

export async function embed(conn: string, texts: string[], inputType: "passage" | "query" = "passage"): Promise<number[][]> {
  const r = await withRetry(() => call(conn, "POST", "/embed", {
    model: EMBED_MODEL, parameters: { input_type: inputType, truncate: "END" }, inputs: texts.map((text) => ({ text })),
  }, { headers: hdr }));
  const t = await r.text();
  if (!r.ok) throw new Error(`pinecone embed HTTP ${r.status}: ${t.slice(0, 200)}`);
  const j = JSON.parse(t);
  return (j.data as { values: number[] }[]).map((d) => d.values);
}

export async function rerank(query: string, docs: { id: string; text: string }[], topN = docs.length): Promise<{ id: string; score: number }[]> {
  const r = await withRetry(() => call(READ, "POST", "/rerank", {
    model: RERANK_MODEL, query, documents: docs, top_n: topN, return_documents: false, rank_fields: ["text"],
  }, { headers: hdr }));
  const t = await r.text();
  if (!r.ok) throw new Error(`pinecone rerank HTTP ${r.status}: ${t.slice(0, 200)}`);
  const j = JSON.parse(t);
  return (j.data as { index: number; score: number }[]).map((d) => ({ id: docs[d.index].id, score: d.score }));
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export type Match = { embed_cos: number; rerank_score: number; model_embed: string; model_rerank: string };

// Score one candidate listing against a receipt line.
export async function matchListing(line: { raw_text: string }, listing: { title: string; brand?: string | null }): Promise<Match> {
  const doc = [listing.brand, listing.title].filter(Boolean).join(" ");
  const [qs, ds] = await Promise.all([embed(READ, [line.raw_text], "query"), embed(READ, [doc], "passage")]);
  const q = qs[0], d = ds[0];
  const rr = await rerank(line.raw_text, [{ id: "listing", text: doc }]);
  return { embed_cos: cosine(q, d), rerank_score: rr[0]?.score ?? 0, model_embed: EMBED_MODEL, model_rerank: RERANK_MODEL };
}

// Pick the best of several candidate listings for one receipt line.
export async function pickBest(line: { raw_text: string }, candidates: { id: string; title: string; brand?: string | null }[]) {
  const docs = candidates.map((c) => ({ id: c.id, text: [c.brand, c.title].filter(Boolean).join(" ") }));
  return rerank(line.raw_text, docs);
}

// Household memory. Needs two extra connections that point at the index host. When they are
// not granted the status page shows "household memory: not connected" rather than pretending.
export async function memoryConnected(conn: "read" | "write"): Promise<boolean> {
  try { await base(conn === "read" ? "pinecone-index-read" : "pinecone-index-write"); return true; } catch { return false; }
}

export async function rememberItem(id: string, raw_text: string, listingId: string, listingTitle: string) {
  const [v] = await embed(WRITE, [raw_text]);
  const r = await call("pinecone-index-write", "POST", "/vectors/upsert", {
    vectors: [{ id, values: v, metadata: { raw_text, listing_id: listingId, title: listingTitle } }], namespace: "household",
  }, { headers: hdr });
  if (!r.ok) throw new Error(`pinecone upsert HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
}

export async function recallItem(raw_text: string): Promise<{ id: string; score: number; listing_id: string; title: string } | null> {
  if (!(await memoryConnected("read"))) return null;
  const [v] = await embed(READ, [raw_text], "query");
  const r = await call("pinecone-index-read", "POST", "/query", { vector: v, topK: 1, includeMetadata: true, namespace: "household" }, { headers: hdr });
  if (!r.ok) return null;
  const j: any = await r.json();
  const m = j.matches?.[0];
  return m ? { id: m.id, score: m.score, listing_id: m.metadata?.listing_id, title: m.metadata?.title } : null;
}

// Runs inside slv-r-<id>. One job, one URL. Reads typed fields from the Apify dataset, scores the
// match with Pinecone, reads the match, writes the evidence, checkpoints, reports typed fields only.
// Untrusted page text is read here and never leaves this Sprite.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { datasetItemsFor, normalizeListing, type ListingFields } from "../connectors/apify.ts";
import { matchListing, type Match } from "../connectors/pinecone.ts";
import { decide, type MatchAnswer } from "../match.ts";
import { sabotage, mode } from "../sabotage.ts";
import { DIR, writeEvidence, checkpoint } from "./evidence.ts";

export type Job = {
  id: string;
  sprite: string;
  line: { raw_text: string; paid_cents: number; qty: number };
  listing_url: string;
  retailer: "target" | "bestbuy";
  clause: { id: string; text: string };
};

export type Report = {
  job_id: string;
  run_id: string;
  decision: "observed" | "stale" | "error";
  reason?: string;
  observed_at: string;
  listing?: ListingFields;
  match?: Match | { error: string };
  read?: MatchAnswer | { error: string };
  evidence_path?: string;
  evidence_day?: string;
  sha256?: string;
  checkpoint?: string | null;
  checkpoint_ms?: number;
  sabotage: string;
  usage?: { cpu_ms: number; wall_ms: number; rss_mb: number };
  calls: { provider: string; route: string; status: number; ms: number }[];
};

export function readJob(): Job {
  return JSON.parse(readFileSync(`${DIR}/job.json`, "utf8"));
}

const reportPath = () => `${DIR}/report.json`;
export function writeReport(r: Report) { writeFileSync(reportPath(), JSON.stringify(r)); }

export function lastReport(): Report | null {
  return existsSync(reportPath()) ? (JSON.parse(readFileSync(reportPath(), "utf8")) as Report) : null;
}

export async function observe(runId: string, datasetId: string, observedAt: string, calls: Report["calls"]): Promise<Report> {
  const job = readJob();
  const prev = lastReport();
  if (prev && prev.run_id === runId) return prev;     // a repeated wake for the same run returns the same report

  const t0 = Date.now();
  const finish = (r: Omit<Report, "job_id" | "run_id" | "sabotage" | "calls" | "observed_at" | "usage">): Report => {
    const cpu = process.cpuUsage();
    const full: Report = { job_id: job.id, run_id: runId, observed_at: observedAt, sabotage: mode(), calls, usage: { cpu_ms: Math.round((cpu.user + cpu.system) / 1000), wall_ms: Date.now() - t0, rss_mb: Math.round(process.memoryUsage().rss / 1048576) }, ...r };
    writeFileSync(reportPath(), JSON.stringify(full));
    return full;
  };

  let items;
  try { items = await datasetItemsFor(datasetId, job.listing_url); }
  catch (e) { return finish({ decision: "error", reason: `could not read the dataset: ${(e as Error).message}` }); }
  if (!items.length) return finish({ decision: "stale", reason: `no observation for this URL in run ${runId}` });
  return decideFromItems(job, items, runId, datasetId, observedAt, finish);
}

// Shared by a scheduled observation and by the "try your own receipt" path, which reads one URL
// directly from an Apify run and never stores the result beyond an hour.
export async function decideFromItems(
  job: Job, items: any[], runId: string, datasetId: string, observedAt: string,
  finish: (r: Omit<Report, "job_id" | "run_id" | "sabotage" | "calls" | "observed_at" | "usage">) => Report,
): Promise<Report> {

  let listing: ListingFields;
  try { listing = normalizeListing(items[0], observedAt, job.retailer === "target" ? "Target" : "Best Buy"); }
  catch (e) { return finish({ decision: "error", reason: `unreadable listing: ${(e as Error).message}` }); }

  // Typed fields only go further. The sabotage hooks act on the typed copy, never on raw text.
  let typed = sabotage("variant", listing as unknown as Record<string, unknown>) as unknown as ListingFields;
  typed = sabotage("poison", typed as unknown as Record<string, unknown>) as unknown as ListingFields;
  const forModels = { title: typed.title, brand: typed.brand, variant: typed.variant, sku: typed.sku, seller: typed.seller, in_stock: typed.in_stock };

  let match: Match | { error: string };
  try { match = await matchListing(job.line, forModels); }
  catch (e) { match = { error: `pinecone: ${(e as Error).message}` }; }

  let read: MatchAnswer | { error: string };
  try { read = decide({ raw_text: job.line.raw_text }, forModels, "rerank_score" in match ? match.rerank_score : null); }
  catch (e) { read = { error: `match: ${(e as Error).message}` }; }

  const day = observedAt.slice(0, 10);
  const evidence = { job_id: job.id, run_id: runId, observed_at: observedAt, apify_dataset: datasetId, listing, listing_as_sent_to_models: forModels, match, read };
  const ev = writeEvidence(day, evidence);
  let cp: { id: string | null; ms: number; raw: string };
  try { cp = checkpoint(`obs ${job.id} ${day} sha256:${ev.sha256}`); }
  catch (e) { cp = { id: null, ms: 0, raw: String((e as Error).message) }; }

  return finish({
    decision: "observed", listing, match, read, evidence_path: ev.path, evidence_day: day, sha256: ev.sha256,
    checkpoint: cp.id, checkpoint_ms: cp.ms,
  });
}

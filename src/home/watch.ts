// The live Black Friday watch summary. An eyes Sprite reads the Apify run history through the gateway
// (worker command watch-sync) and home turns the price series into the numbers /api/stats serves.
// Nothing is estimated: every figure is a count or a difference of readings the Sprite returned.
import { readFileSync, existsSync } from "node:fs";
import * as sprites from "../connectors/sprites.ts";
import { db, kvGet, kvSet, event } from "./db.ts";
import { WORKER_PATH } from "./fleet.ts";

export type WatchSummary = {
  synced_at: string; runs_total: number; runs_unattended: number; items_watched: number; items_changed: number; items_cheaper_now: number;
  owed_total_cents: number; median_owed_cents: number | null; largest_drop: { id: string; from_cents: number; to_cents: number; drop_cents: number } | null;
  first_reading_at: string | null; last_reading_at: string | null; hours_watched: number; cost_usd: number;
};

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

export function summarise(sync: { synced_at: string; runs: { at: string; origin: string; cost_usd: number | null }[]; series: Record<string, { at: string; cents: number }[]> }): WatchSummary {
  const ids = Object.keys(sync.series);
  let changed = 0; const drops: { id: string; from_cents: number; to_cents: number; drop_cents: number }[] = [];
  for (const id of ids) {
    const s = sync.series[id];
    if (s.length < 2) continue;
    if (s.some((x, k) => k > 0 && x.cents !== s[k - 1].cents)) changed++;
    const first = s[0].cents, last = s[s.length - 1].cents;
    if (last < first) drops.push({ id, from_cents: first, to_cents: last, drop_cents: first - last });
  }
  const times = sync.runs.map((r) => r.at).sort();
  const biggest = drops.length ? drops.reduce((a, b) => (b.drop_cents > a.drop_cents ? b : a)) : null;
  return {
    synced_at: sync.synced_at, runs_total: sync.runs.length, runs_unattended: sync.runs.filter((r) => r.origin === "SCHEDULER").length,
    items_watched: ids.length, items_changed: changed, items_cheaper_now: drops.length, owed_total_cents: drops.reduce((n, d) => n + d.drop_cents, 0),
    median_owed_cents: median(drops.map((d) => d.drop_cents)), largest_drop: biggest, first_reading_at: times[0] ?? null, last_reading_at: times.at(-1) ?? null,
    hours_watched: times.length > 1 ? Math.round((new Date(times.at(-1)!).getTime() - new Date(times[0]).getTime()) / 3_600_000) : 0,
    cost_usd: sync.runs.reduce((n, r) => n + (r.cost_usd ?? 0), 0),
  };
}

export function lastSummary(): WatchSummary | null {
  const v = kvGet("watch:summary");
  return v ? (JSON.parse(v) as WatchSummary) : null;
}

let syncing = false;
// Picks any eyes Sprite that is born (a receipt Sprite or the try pool) and asks it to read the history.
export async function syncWatch(): Promise<WatchSummary | null> {
  const task = process.env.SALVOR_APIFY_TASK;
  const listFile = process.env.SALVOR_WATCH_ITEMS ?? "evidence/labels/p1-items.json";
  if (!task || !existsSync(listFile) || syncing) return lastSummary();
  syncing = true;
  try {
    const row = db().prepare("SELECT sprite FROM receipts WHERE sprite IS NOT NULL AND status NOT IN ('retired') LIMIT 1").get() as { sprite: string } | undefined;
    const name = row?.sprite ?? "slv-r-try-1";
    const r = await sprites.exec(name, ["node", WORKER_PATH, "watch-sync"], { stdin: JSON.stringify({ task, items: JSON.parse(readFileSync(listFile, "utf8")) }) });
    const sync = JSON.parse(r.stdout.trim().split("\n").pop() ?? "");
    if (sync.error) throw new Error(sync.error);
    const sum = summarise(sync);
    kvSet("watch:summary", JSON.stringify(sum));
    event("watch_sync", { runs: sum.runs_total, cheaper: sum.items_cheaper_now });
    return sum;
  } catch (e) {
    event("watch_sync_failed", { error: String((e as Error).message).slice(0, 200) });
    return lastSummary();
  } finally { syncing = false; }
}

// Turn the Apify watch history into run files (PROOF_PLAN amendment 1). Reads every successful run of
// the scheduled task, keeps the first reading of each frozen item as the price a buyer on that day
// would have paid, and compares every later reading against it. Rewrites evidence/runs/watch.jsonl and
// evidence/runs/p1.jsonl from scratch, so it is safe to run again. Apify keeps run data for 7 days, so
// run this at least every few days and commit the files.
//   APIFY_TOKEN=... SALVOR_APIFY_TASK=... node scripts/ingest-watch.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { need } from "./lib/api.mjs";
import { normalizeListing, canonicalUrl } from "../src/connectors/apify.ts";

need("APIFY_TOKEN", "SALVOR_APIFY_TASK");
const API = "https://api.apify.com/v2", H = { authorization: `Bearer ${process.env.APIFY_TOKEN}` };
const get = async (p) => { const r = await fetch(API + p, { headers: H }); if (!r.ok) throw new Error(`${p} HTTP ${r.status}`); return r.json(); };

const listText = readFileSync("evidence/labels/p1-items.json", "utf8");
if (createHash("sha256").update(listText).digest("hex") !== readFileSync("evidence/labels/p1-items.sha256", "utf8").trim()) { console.error("the frozen item list changed; refusing to ingest"); process.exit(1); }
const items = JSON.parse(listText);
const idFor = (url) => { const c = canonicalUrl(url); return items.find((i) => canonicalUrl(i.url) === c)?.id ?? null; };

const listed = (await get(`/actor-tasks/${process.env.SALVOR_APIFY_TASK}/runs?limit=200&desc=0`)).data.items.filter((r) => r.status === "SUCCEEDED");
// The list route omits each run's origin; the detail route has it ("SCHEDULER" for runs the schedule started).
const runs = [];
for (const r of listed) { const d = (await get(`/actor-runs/${r.id}`)).data; runs.push({ ...r, origin: d.meta?.origin ?? d.origin ?? "unknown", usageTotalUsd: d.usageTotalUsd ?? r.usageTotalUsd }); }
const series = Object.fromEntries(items.map((i) => [i.id, []]));   // id -> [{at, cents, run}]
const watch = [];
for (const r of runs) {
  const rows = await (await fetch(`${API}/datasets/${r.defaultDatasetId}/items?clean=true&limit=1000`, { headers: H })).json();
  const at = r.finishedAt ?? r.startedAt;
  let got = 0;
  for (const it of rows) {
    const id = idFor(String(it.url ?? it.inputUrl ?? ""));
    if (!id) continue;
    try { const l = normalizeListing(it, at); series[id].push({ at, cents: l.price_cents, run: r.id }); got++; } catch { /* unreadable reading: counted as a miss for that run */ }
  }
  watch.push({ kind: "watch_run", run_id: r.id, at, origin: r.origin ?? "unknown", items: got, cost_usd: r.usageTotalUsd ?? null });
}
// drops per run: items whose price is below their first reading at that run
for (const w of watch) w.drops = items.filter((i) => { const s = series[i.id]; const first = s[0]; const here = s.find((x) => x.run === w.run_id); return first && here && here.cents < first.cents; }).length;

const p1 = items.map((i) => {
  const s = series[i.id];
  const first = s[0], last = s[s.length - 1];
  let reason = null;
  if (!first) reason = "no readable price in any run";
  else if (s.length < 2) reason = "only one reading so far";
  return { kind: "p1_item", id: i.id, url: i.url, archive_cents: first?.cents ?? null, archive_date: first?.at?.slice(0, 10) ?? null, now_cents: s.length >= 2 ? last.cents : null, now_at: last?.at ?? null, reason };
});

mkdirSync("evidence/runs", { recursive: true });
writeFileSync("evidence/runs/watch.jsonl", watch.map((x) => JSON.stringify(x)).join("\n") + (watch.length ? "\n" : ""));
// P2 per item: how many readings, how many times the price changed, first, latest, and the lowest seen.
const p2 = items.map((i) => {
  const s = series[i.id];
  let changes = 0; for (let k = 1; k < s.length; k++) if (s[k].cents !== s[k - 1].cents) changes++;
  return { kind: "p2_item", id: i.id, readings: s.length, changes, first_cents: s[0]?.cents ?? null, last_cents: s.at(-1)?.cents ?? null, min_cents: s.length ? Math.min(...s.map((x) => x.cents)) : null, first_at: s[0]?.at ?? null, last_at: s.at(-1)?.at ?? null };
});
writeFileSync("evidence/runs/p2.jsonl", p2.map((x) => JSON.stringify(x)).join("\n") + "\n");
writeFileSync("evidence/runs/p1.jsonl", p1.map((x) => JSON.stringify(x)).join("\n") + "\n");
console.log(`${watch.length} runs, ${p1.filter((x) => !x.reason).length} items with a first and a later reading, ${p1.filter((x) => x.reason).length} waiting or missed`);

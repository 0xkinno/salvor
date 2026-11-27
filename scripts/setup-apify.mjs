// Create the clock: an Apify task that reads the watched URLs, a schedule every 6 hours, and a
// webhook that knocks slv-home when a run succeeds. Run by the owner or build agent with a local
// APIFY_TOKEN. The token never goes to a Sprite.
//   APIFY_TOKEN=... SALVOR_URL=https://slv-home-xxxx.sprites.app SALVOR_HOOK_SECRET=... node scripts/setup-apify.mjs
// Env: SALVOR_APIFY_ACTOR (default apify/e-commerce-scraping-tool), SALVOR_WATCH_FILE (JSON array of URLs)
import { readFileSync, existsSync } from "node:fs";
import { need } from "./lib/api.mjs";

need("APIFY_TOKEN");
const HOOK = Boolean(process.env.SALVOR_URL && process.env.SALVOR_HOOK_SECRET);   // without a live home URL the schedule still collects history; the webhook is added on a re-run
const API = "https://api.apify.com/v2";
const H = { authorization: `Bearer ${process.env.APIFY_TOKEN}`, "content-type": "application/json" };
const actor = (process.env.SALVOR_APIFY_ACTOR ?? "apify/e-commerce-scraping-tool").replace("/", "~");
const watch = existsSync(process.env.SALVOR_WATCH_FILE ?? "evidence/labels/watch.json") ? JSON.parse(readFileSync(process.env.SALVOR_WATCH_FILE ?? "evidence/labels/watch.json", "utf8")) : [];
if (!watch.length) { console.error("no watch list: put URLs in evidence/labels/watch.json or set SALVOR_WATCH_FILE"); process.exit(1); }

const j = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let o = null; try { o = JSON.parse(t); } catch { /* text */ }
  if (!r.ok) throw new Error(`${method} ${path} HTTP ${r.status} ${t.slice(0, 200)}`);
  return o;
};

const input = JSON.parse(process.env.SALVOR_APIFY_TASK_INPUT ?? JSON.stringify({ detailsUrls: watch.map((url) => ({ url })), listingUrls: [], scrapeMode: "AUTO" }));
const taskName = "salvor-watch";
let task = (await j("GET", "/actor-tasks?limit=100")).data.items.find((t) => t.name === taskName);
if (task) { await j("PUT", `/actor-tasks/${task.id}`, { input }); console.log(`updated task ${task.id}`); }
else { task = (await j("POST", "/actor-tasks", { actId: actor, name: taskName, input })).data; console.log(`created task ${task.id}`); }

// Black Friday cadence (PROOF_PLAN amendment 3): every 4 hours Friday and Saturday, every 6 hours Sunday,
// midnight and 06:00 UTC Monday, then nothing. Idempotent: schedules are found by name and updated.
const PLAN = [["salvor-bf-4h-fri-sat", "0 0,4,8,12,16,20 * * 5,6"], ["salvor-6h-sun", "0 0,6,12,18 * * 0"], ["salvor-mon-morning", "0 0,6 * * 1"]];
const existing = (await j("GET", "/schedules?limit=100")).data.items;
for (const [name, cron] of PLAN) {
  const body = { name, cronExpression: cron, timezone: "UTC", isEnabled: true, isExclusive: true, actions: [{ type: "RUN_ACTOR_TASK", actorTaskId: task.id }] };
  const ex = existing.find((s) => s.name === name);
  const r = ex ? (await j("PUT", `/schedules/${ex.id}`, body)).data : (await j("POST", "/schedules", body)).data;
  console.log(`schedule ${name} (${cron}) ${r.id}`);
}

// Webhook payload carries just what slv-home needs. A duplicate delivery is harmless (idempotent by run id).
if (!HOOK) { console.log("no SALVOR_URL yet: schedule created, webhook skipped (re-run once slv-home is live)"); console.log(`\nSALVOR_APIFY_TASK=${task.id}`); process.exit(0); }
const url = `${process.env.SALVOR_URL.replace(/\/$/, "")}/hooks/apify/${process.env.SALVOR_HOOK_SECRET}`;
const hooks = (await j("GET", `/actor-tasks/${task.id}/webhooks`)).data?.items ?? [];
const payloadTemplate = '{"runId": {{resource.id}}, "datasetId": {{resource.defaultDatasetId}}, "finishedAt": {{resource.finishedAt}}, "status": {{resource.status}}}';
if (!hooks.some((h) => h.requestUrl === url)) {
  await j("POST", "/webhooks", { eventTypes: ["ACTOR.RUN.SUCCEEDED"], condition: { actorTaskId: task.id }, requestUrl: url, payloadTemplate, shouldInterpolateStrings: true, isAdHoc: false });
  console.log("webhook created");
} else console.log("webhook already present");
console.log(`\nSALVOR_APIFY_TASK=${task.id}   (set this on slv-home and in the GitHub Actions secret for the backup tick)`);

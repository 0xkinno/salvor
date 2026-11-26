// Create the clock: an Apify task that reads the watched URLs, a schedule every 6 hours, and a
// webhook that knocks slv-home when a run succeeds. Run by the owner or build agent with a local
// APIFY_TOKEN. The token never goes to a Sprite.
//   APIFY_TOKEN=... SALVOR_URL=https://slv-home-xxxx.sprites.app SALVOR_HOOK_SECRET=... node scripts/setup-apify.mjs
// Env: SALVOR_APIFY_ACTOR (default apify/e-commerce-scraping-tool), SALVOR_WATCH_FILE (JSON array of URLs)
import { readFileSync, existsSync } from "node:fs";
import { need } from "./lib/api.mjs";

need("APIFY_TOKEN", "SALVOR_URL", "SALVOR_HOOK_SECRET");
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

const schedName = "salvor-every-6h";
let sched = (await j("GET", "/schedules?limit=100")).data.items.find((s) => s.name === schedName);
const body = { name: schedName, cronExpression: "0 */6 * * *", timezone: "UTC", isEnabled: true, isExclusive: true, actions: [{ type: "RUN_ACTOR_TASK", actorTaskId: task.id }] };
sched = sched ? (await j("PUT", `/schedules/${sched.id}`, body)).data : (await j("POST", "/schedules", body)).data;
console.log(`schedule ${sched.id}: every 6 hours UTC`);

// Webhook payload carries just what slv-home needs. A duplicate delivery is harmless (idempotent by run id).
const url = `${process.env.SALVOR_URL.replace(/\/$/, "")}/hooks/apify/${process.env.SALVOR_HOOK_SECRET}`;
const hooks = (await j("GET", `/actor-tasks/${task.id}/webhooks`)).data?.items ?? [];
const payloadTemplate = '{"runId": {{resource.id}}, "datasetId": {{resource.defaultDatasetId}}, "finishedAt": {{resource.finishedAt}}, "status": {{resource.status}}}';
if (!hooks.some((h) => h.requestUrl === url)) {
  await j("POST", "/webhooks", { eventTypes: ["ACTOR.RUN.SUCCEEDED"], condition: { actorTaskId: task.id }, requestUrl: url, payloadTemplate, shouldInterpolateStrings: true, isAdHoc: false });
  console.log("webhook created");
} else console.log("webhook already present");
console.log(`\nSALVOR_APIFY_TASK=${task.id}   (set this on slv-home and in the GitHub Actions secret for the backup tick)`);

// Target's Deal of the Day, observed rather than staged. Target previews each day's deal a day ahead (third party
// listings name the category). Before the deal goes live, the preview items are read from Target's own search
// pages through Apify; the list and its hash are frozen in evidence/labels/dotd-<date>.json before any second
// reading. A daily Apify task then re-reads exactly those product pages.
//   node scripts/dotd.mjs freeze <deal-date YYYY-MM-DD> "<search term>" [maxItems]
//   node scripts/dotd.mjs task            create or update the daily re-read task from every frozen list
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { need } from "./lib/api.mjs";
need("APIFY_TOKEN");
const H = { authorization: `Bearer ${process.env.APIFY_TOKEN}`, "content-type": "application/json" };
const A = "https://api.apify.com/v2";
const ACTOR = "apify~e-commerce-scraping-tool";
const cents = (v) => (v == null ? null : Math.round(Number(String(v).replace(/[^0-9.]/g, "")) * 100));
const tcin = (u) => (/A-(\d+)/.exec(u) ?? [])[1] ?? (/\/(\d{6,8})\.p/.exec(u) ?? [])[1] ?? null;   // Target tcin or Best Buy sku

async function run(input) {
  const s = (await (await fetch(`${A}/acts/${ACTOR}/runs?timeout=240&memory=2048`, { method: "POST", headers: H, body: JSON.stringify(input) })).json()).data;
  if (!s?.id) throw new Error("run did not start");
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const r = (await (await fetch(`${A}/actor-runs/${s.id}`, { headers: H })).json()).data;
    if (r.status === "SUCCEEDED") return { id: s.id, items: await (await fetch(`${A}/datasets/${r.defaultDatasetId}/items?clean=true`, { headers: H })).json(), cost: r.usageTotalUsd };
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(r.status)) throw new Error(`run ${r.status}`);
  }
  throw new Error("run did not finish");
}

const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === "freeze") {
  const date = a, term = b, max = Number(c ?? 15);
  const credit = await (await fetch(`${A}/users/me/limits`, { headers: H })).json();
  const rec = { at: new Date().toISOString(), apify_monthly_limit_usd: credit.data.limits.maxMonthlyUsageUsd, apify_used_usd: credit.data.current.monthlyUsageUsd };
  const r = await run({ listingUrls: [{ url: /^https:/.test(term) ? term : `https://www.target.com/s?searchTerm=${encodeURIComponent(term)}` }], detailsUrls: [], maxProductResults: max, scrapeMode: "AUTO" });
  const items = r.items.filter((x) => x.name && x.url && x.offers?.price != null && tcin(x.url)).map((x) => ({ id: tcin(x.url), title: String(x.name), url: x.url, price_cents_before: cents(x.offers.price), read_at: rec.at }));
  const seen = new Set(); const uniq = items.filter((x) => !seen.has(x.id) && seen.add(x.id));
  const body = { deal_date: date, deal: term, source: "Target's own search page, read through Apify before the deal went live", frozen_at: rec.at, apify_credit_before: rec, run_id: r.id, items: uniq };
  const text = JSON.stringify(body, null, 1);
  writeFileSync(`evidence/labels/dotd-${date}.json`, text);
  writeFileSync(`evidence/labels/dotd-${date}.sha256`, createHash("sha256").update(text).digest("hex") + "\n");
  console.log(`frozen ${uniq.length} items for ${date} (${term}), sha256 ${createHash("sha256").update(text).digest("hex").slice(0, 16)}, credit used ${rec.apify_used_usd.toFixed(2)} of ${rec.apify_monthly_limit_usd}`);
} else if (cmd === "task") {
  const files = readdirSync("evidence/labels").filter((f) => /^dotd-.*\.json$/.test(f));
  const urls = [...new Set(files.flatMap((f) => JSON.parse(readFileSync(`evidence/labels/${f}`, "utf8")).items.map((i) => i.url)))];
  const input = { detailsUrls: urls.map((url) => ({ url })), listingUrls: [], scrapeMode: "AUTO" };
  const tasks = (await (await fetch(`${A}/actor-tasks?limit=50`, { headers: H })).json()).data.items;
  let t = tasks.find((x) => x.name === "salvor-dotd");
  if (t) await fetch(`${A}/actor-tasks/${t.id}`, { method: "PUT", headers: H, body: JSON.stringify({ input }) });
  else t = (await (await fetch(`${A}/actor-tasks`, { method: "POST", headers: H, body: JSON.stringify({ actId: ACTOR, name: "salvor-dotd", input }) })).json()).data;
  const sch = (await (await fetch(`${A}/schedules?limit=50`, { headers: H })).json()).data.items.find((x) => x.name === "salvor-dotd");
  // 12:00 UTC each day, after Target's deals go live (midnight Central). The Apify budget allows one read a day.
  const actions = [{ type: "RUN_ACTOR_TASK", actorTaskId: t.id }];
  const body = { name: "salvor-dotd", cronExpression: "0 12 * * *", timezone: "UTC", isEnabled: true, isExclusive: false, actions };
  if (sch) await fetch(`${A}/schedules/${sch.id}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  else await fetch(`${A}/schedules`, { method: "POST", headers: H, body: JSON.stringify(body) });
  console.log(`task ${t.id}: ${urls.length} product pages, schedule 12:00 UTC daily`);
}

// Pairs each frozen Deal of the Day item's price before the deal (evidence/labels/dotd-*.json) with every later reading
// by the salvor-dotd Apify task. Writes evidence/runs/dotd.jsonl; nothing is typed or estimated.
//   APIFY_TOKEN=... node scripts/ingest-dotd.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { need } from "./lib/api.mjs";
need("APIFY_TOKEN");
const H = { authorization: `Bearer ${process.env.APIFY_TOKEN}` }, A = "https://api.apify.com/v2";
const tcin = (u) => (/A-(\d+)/.exec(String(u ?? "")) ?? [])[1] ?? null;
const cents = (v) => (v == null ? null : Math.round(Number(String(v).replace(/[^0-9.]/g, "")) * 100));
const lists = readdirSync("evidence/labels").filter((f) => /^dotd-.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(`evidence/labels/${f}`, "utf8")));
const tasks = (await (await fetch(`${A}/actor-tasks?limit=50`, { headers: H })).json()).data.items;
const t = tasks.find((x) => x.name === "salvor-dotd");
const out = [];
if (t) {
  const runs = (await (await fetch(`${A}/actor-tasks/${t.id}/runs?limit=100&desc=0`, { headers: H })).json()).data.items.filter((r) => r.status === "SUCCEEDED");
  for (const r of runs) {
    const items = await (await fetch(`${A}/datasets/${r.defaultDatasetId}/items?clean=true`, { headers: H })).json();
    for (const it of items) {
      const id = tcin(it.url ?? it.inputUrl); const now = cents(it.offers?.price);
      if (!id || now == null) continue;
      for (const l of lists) {
        const f = l.items.find((x) => x.id === id);
        if (!f || r.startedAt < `${l.deal_date}T06:00:00Z`) continue;   // only readings after the deal's day began count as "after"
        out.push({ kind: "dotd_read", deal_date: l.deal_date, deal: l.deal, item: id, title: f.title, before_cents: f.price_cents_before, after_cents: now, after_run_at: r.startedAt, run_id: r.id, list_sha256: readFileSync(`evidence/labels/dotd-${l.deal_date}.sha256`, "utf8").trim() });
      }
    }
  }
}
writeFileSync("evidence/runs/dotd.jsonl", out.map((x) => JSON.stringify(x)).join("\n") + (out.length ? "\n" : ""));
console.log(`${out.length} paired readings, ${out.filter((x) => x.after_cents < x.before_cents).length} lower`);

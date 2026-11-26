// Numbers are generated, never typed. Reads only evidence/runs/*.jsonl and writes docs/FACTS.json.
//   node scripts/facts.mjs           write
//   node scripts/facts.mjs --check   fail if docs/FACTS.json is stale against the run files (CI)
// Record kinds (one JSON object per line, field "kind"):
//   p1_item   {id, url, archive_cents|null, archive_date, now_cents|null, now_at, reason|null}
//   watch_run {run_id, at, items, drops}
//   p3_pair   {id, split:"tune"|"test", origin:"curated"|"wild", label, jev_same, jev_conf, llm_same, llm_conf}
//   p3_pick   {tau, tau_owed, chosen_on:"tune", tune_n}
//   p4_cost   {sprite, total_usd, days, partial}
//   p5_case   {id, name, expected, observed, pass}
//   hero      {item, paid_cents, now_cents, owed_cents, retailer, at, run_id}
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const DIR = "evidence/runs";
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".jsonl")).sort() : [];
const rows = [];
const sources = {};
for (const f of files) {
  const text = readFileSync(`${DIR}/${f}`, "utf8");
  sources[f] = createHash("sha256").update(text).digest("hex");
  for (const ln of text.split("\n")) if (ln.trim()) { try { rows.push(JSON.parse(ln)); } catch { throw new Error(`${f}: line is not JSON`); } }
}
const of = (k) => rows.filter((r) => r.kind === k);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

// P1: items with a usable archive price AND a usable current price
const p1 = of("p1_item");
const usable = p1.filter((r) => Number.isInteger(r.archive_cents) && Number.isInteger(r.now_cents));
const cheaper = usable.filter((r) => r.now_cents < r.archive_cents);
const owed = cheaper.map((r) => r.archive_cents - r.now_cents);
const misses = p1.filter((r) => !usable.includes(r)).map((r) => ({ id: r.id, reason: r.reason ?? "unusable" }));

// P3 at the chosen threshold, curated and wild apart, both directions
const pick = of("p3_pick").at(-1) ?? null;
function rates(origin, who) {
  if (!pick) return null;
  const set = of("p3_pair").filter((r) => r.split === "test" && r.origin === origin);
  if (!set.length) return null;
  const same = (r) => (who === "jev" ? r.jev_same : r.llm_same), conf = (r) => (who === "jev" ? r.jev_conf : r.llm_conf);
  const claims = set.filter((r) => same(r) === "exact" && conf(r) >= pick.tau);
  const wrong = claims.filter((r) => r.label !== "exact").length;
  const truth = set.filter((r) => r.label === "exact");
  const missed = truth.filter((r) => !(same(r) === "exact" && conf(r) >= pick.tau)).length;
  const asked = set.filter((r) => !(conf(r) >= pick.tau)).length;
  return { n: set.length, claims: claims.length, wrong_claims: wrong, wrong_claim_rate: claims.length ? wrong / claims.length : null, truth: truth.length, missed, missed_claim_rate: truth.length ? missed / truth.length : null, ask_rate: asked / set.length };
}
const costs = of("p4_cost");
const costTotal = costs.reduce((s, r) => s + r.total_usd, 0);
const costDays = costs.reduce((s, r) => s + (r.days ?? 0), 0);
const runs = of("watch_run");

const facts = {
  empty: rows.length === 0,
  p1: { n_listed: p1.length, n_items: usable.length, share_cheaper: usable.length ? cheaper.length / usable.length : null, owed_total_cents: owed.reduce((a, b) => a + b, 0), median_owed_cents: median(owed), misses },
  p2: { runs_completed: runs.length, drops_seen: runs.reduce((s, r) => s + (r.drops ?? 0), 0), first_run_at: runs[0]?.at ?? null, last_run_at: runs.at(-1)?.at ?? null },
  p3: pick ? { tau: pick.tau, tau_owed: pick.tau_owed, chosen_on: pick.chosen_on, tune_n: pick.tune_n, curated: { jev: rates("curated", "jev"), llm: rates("curated", "llm") }, wild: { jev: rates("wild", "jev"), llm: rates("wild", "llm") } } : null,
  p4: { receipts_metered: costs.length, per_receipt_usd: costs.length ? costTotal / costs.length : null, per_receipt_per_day_usd: costDays ? costTotal / costDays : null, partial_rows: costs.filter((c) => c.partial).length },
  p5: of("p5_case").map((c) => ({ id: c.id, name: c.name, expected: c.expected, observed: c.observed, pass: c.pass })),
  hero: of("hero").at(-1) ?? null,
  sources,
};
// Flat aliases used by the README and UI, so no number is ever typed by hand.
facts.n_items = facts.p1.n_items;
facts.owed_total_cents = facts.p1.owed_total_cents;
facts.share_cheaper = facts.p1.share_cheaper;
facts.cost_per_receipt_usd = facts.p4.per_receipt_usd;
facts.wrong_claim_rate = facts.p3?.curated?.jev?.wrong_claim_rate ?? null;

const strip = (o) => JSON.stringify({ ...o, generated_at: undefined }, null, 2);
if (process.argv.includes("--check")) {
  const cur = existsSync("docs/FACTS.json") ? JSON.parse(readFileSync("docs/FACTS.json", "utf8")) : null;
  if (!cur || strip(cur) !== strip(facts)) { console.error("docs/FACTS.json is stale: run node scripts/facts.mjs and commit it"); process.exit(1); }
  console.log("facts: up to date");
} else {
  facts.generated_at = new Date().toISOString();
  writeFileSync("docs/FACTS.json", JSON.stringify(facts, null, 2) + "\n");
  console.log(`docs/FACTS.json written from ${files.length} run file(s), ${rows.length} record(s)`);
}

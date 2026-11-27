// Numbers are generated, never typed. Reads only evidence/runs/*.jsonl and writes docs/FACTS.json.
//   node scripts/facts.mjs           write
//   node scripts/facts.mjs --check   fail if docs/FACTS.json is stale against the run files (CI)
// Record kinds (one JSON object per line, field "kind"):
//   p1_item   {id, url, archive_cents|null, archive_date, now_cents|null, now_at, reason|null}
//   watch_run {run_id, at, items, drops}
//   p3_pair   {id, split:"tune"|"test", origin:"curated"|"wild", label, m_same, m_conf, r_same, r_conf}
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
  const same = (r) => (who === "full" ? r.m_same : r.r_same), conf = (r) => (who === "full" ? r.m_conf : r.r_conf);
  const claims = set.filter((r) => same(r) === "exact" && conf(r) >= pick.tau);
  const wrong = claims.filter((r) => r.label !== "exact").length;
  const truth = set.filter((r) => r.label === "exact");
  const missed = truth.filter((r) => !(same(r) === "exact" && conf(r) >= pick.tau)).length;
  const asked = set.filter((r) => !(conf(r) >= pick.tau)).length;
  return { n: set.length, claims: claims.length, wrong_claims: wrong, wrong_claim_rate: claims.length ? wrong / claims.length : null, truth: truth.length, missed, missed_claim_rate: truth.length ? missed / truth.length : null, ask_rate: asked / set.length };
}
const ranks = of("p3_rank").filter((r) => !r.failed);
const hardAll = of("p3_hard"), hard = hardAll.filter((r) => !r.failed);
const hardRate = (k) => (hard.length ? hard.filter((r) => r[k]).length / hard.length : null);
const hardSummary = hardAll.length ? {
  asked: hardAll.length, ranked: hard.length, candidates: hard[0]?.candidates ?? null, set_sha256: hardAll[0].set_sha256,
  not_ranked: hardAll.filter((r) => r.failed).map((r) => r.id), not_ranked_reason: "Pinecone's monthly rerank limit of 500 requests for the free plan was reached part-way through the run (HTTP 429, RESOURCE_EXHAUSTED)",
  pinecone_top1: hardRate("pinecone_top1"), pinecone_top3: hardRate("pinecone_top3"), lexical_top1: hardRate("lexical_top1"), lexical_top3: hardRate("lexical_top3"),
  pinecone_missed_top1: hard.filter((r) => !r.pinecone_top1).map((r) => r.id), lexical_missed_top1: hard.filter((r) => !r.lexical_top1).map((r) => r.id),
} : null;
const rankRate = (k) => (ranks.length ? ranks.filter((r) => r[k]).length / ranks.length : null);
const costs = of("p4_cost");
const costTotal = costs.reduce((s, r) => s + r.total_usd, 0);
const costDays = costs.reduce((s, r) => s + (r.days ?? 0), 0);
// P2 counts only runs the schedule started. A manual baseline run is kept in the file but not counted as unattended.
const runs = of("watch_run").filter((r) => r.origin === "SCHEDULER");
const allRuns = of("watch_run");
const p2items = of("p2_item");
const changedItems = p2items.filter((x) => x.changes > 0);
const cheaperItems = p2items.filter((x) => x.last_cents !== null && x.first_cents !== null && x.last_cents < x.first_cents);
const owedP2 = cheaperItems.map((x) => x.first_cents - x.last_cents);
const biggest = cheaperItems.length ? cheaperItems.reduce((a, b) => (b.first_cents - b.last_cents > a.first_cents - a.last_cents ? b : a)) : null;

const facts = {
  empty: rows.length === 0,
  p1: { n_listed: p1.length, n_items: usable.length, share_cheaper: usable.length ? cheaper.length / usable.length : null, owed_total_cents: owed.reduce((a, b) => a + b, 0), median_owed_cents: median(owed), misses },
  p2: { runs_completed: runs.length, runs_total: allRuns.length, items_watched: p2items.length, items_changed: changedItems.length, items_cheaper_now: cheaperItems.length, owed_total_cents: owedP2.reduce((a, b) => a + b, 0), median_owed_cents: median(owedP2), largest_drop: biggest ? { id: biggest.id, from_cents: biggest.first_cents, to_cents: biggest.last_cents, drop_cents: biggest.first_cents - biggest.last_cents } : null, drops_seen: runs.reduce((s, r) => s + (r.drops ?? 0), 0), first_run_at: allRuns[0]?.at ?? null, last_run_at: allRuns.at(-1)?.at ?? null, hours_watched: allRuns.length > 1 ? Math.round((new Date(allRuns.at(-1).at) - new Date(allRuns[0].at)) / 3600000) : 0 },
  p3: pick ? { hard: hardSummary, rank: ranks.length ? { n: ranks.length, candidates: ranks[0].candidates, failed: of("p3_rank").length - ranks.length, pinecone_top1: rankRate("pinecone_top1"), pinecone_top3: rankRate("pinecone_top3"), lexical_top1: rankRate("lexical_top1"), lexical_top3: rankRate("lexical_top3") } : null, failed_pairs: of("p3_fail").length, tau: pick.tau, tau_owed: pick.tau_owed, chosen_on: pick.chosen_on, tune_n: pick.tune_n, curated: { full: rates("curated", "full"), rules: rates("curated", "rules") }, wild: { full: rates("wild", "full"), rules: rates("wild", "rules") } } : null,
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
facts.wrong_claim_rate = facts.p3?.curated?.full?.wrong_claim_rate ?? null;

// The README's "Measured" block is generated from FACTS between two markers, so no number is typed there.
function injectReadme(f) {
  if (!existsSync("README.md")) return;
  const d = (c) => (c === null || c === undefined ? "n/a" : `$${(c / 100).toFixed(2)}`);
  const p = (v) => (v === null || v === undefined ? "n/a" : `${(v * 100).toFixed(1)}%`);
  const u = (v) => (v === null || v === undefined ? "n/a" : `$${v.toFixed(4)}`);
  // Only measured, non-empty lines. A value that does not exist yet is left out, never printed as n/a.
  const has = (v) => v !== null && v !== undefined;
  const h = f.p3?.hard;
  const lines = f.empty ? [] : [
    f.hero ? `- **End to end, on the real platform:** a webhook woke the home Sprite, which woke a receipt Sprite; it read a live Target price (${d(f.hero.now_cents)} against ${d(f.hero.paid_cents)} paid for ${f.hero.item}), matched the listing with Pinecone, checkpointed the evidence and AgentMail delivered the claim.` : null,
    f.p2.runs_completed ? `- **Black Friday watch:** ${f.p2.runs_completed} runs over ${f.p2.hours_watched} hours across ${f.p2.items_watched} items; ${f.p2.items_changed} changed price so far (${f.p2.items_cheaper_now} cheaper than at first sight). The schedule keeps running through Monday.` : null,
    f.p1.n_items ? `- **Early study (real public data):** ${f.p1.n_items} items read, ${p(f.p1.share_cheaper)} cheaper than the listed price at the time.` : null,
    has(f.p3?.curated?.full?.wrong_claim_rate) ? `- **Same-item decision at tau ${f.p3.tau}:** ${f.p3.curated.full.wrong_claims} wrong claims of ${f.p3.curated.full.claims} on the curated test split (${p(f.p3.curated.full.wrong_claim_rate)}), ${p(f.p3.curated.full.missed_claim_rate)} missed, asked a person on ${p(f.p3.curated.full.ask_rate)} of lines.` : null,
    h ? `- **Hard ranking set:** ${h.ranked} receipt lines, each against ${h.candidates} real listings; Pinecone rerank first place ${p(h.pinecone_top1)} (top three ${p(h.pinecone_top3)}), word overlap ${p(h.lexical_top1)} (${p(h.lexical_top3)}). ${h.not_ranked.length} more lines were not ranked because Pinecone's monthly free rerank limit ran out; they are listed by id on /proof.` : null,
    f.p4.receipts_metered ? `- **Cost per receipt:** ${u(f.p4.per_receipt_usd)} per receipt over ${f.p4.receipts_metered} retired Sprites.` : null,
    f.p5.length ? `- **Break campaign:** ${f.p5.filter((c) => c.pass).length} of ${f.p5.length} cases passed, including a poisoned page and a swapped listing; failures are listed on /proof.` : null,
  ].filter(Boolean);
  const block = lines.length ? lines.join("\n") : "_Numbers appear here as soon as the first run files exist._";
  const r = readFileSync("README.md", "utf8");
  const next = r.replace(/<!-- FACTS:START -->[\s\S]*?<!-- FACTS:END -->/, `<!-- FACTS:START -->\n${block}\n<!-- FACTS:END -->`);
  if (next !== r) writeFileSync("README.md", next);
}

const strip = (o) => JSON.stringify({ ...o, generated_at: undefined }, null, 2);
if (process.argv.includes("--check")) {
  const cur = existsSync("docs/FACTS.json") ? JSON.parse(readFileSync("docs/FACTS.json", "utf8")) : null;
  if (!cur || strip(cur) !== strip(facts)) { console.error("docs/FACTS.json is stale: run node scripts/facts.mjs and commit it"); process.exit(1); }
  console.log("facts: up to date");
} else {
  facts.generated_at = new Date().toISOString();
  writeFileSync("docs/FACTS.json", JSON.stringify(facts, null, 2) + "\n");
  injectReadme(facts);
  console.log(`docs/FACTS.json written from ${files.length} run file(s), ${rows.length} record(s)`);
}

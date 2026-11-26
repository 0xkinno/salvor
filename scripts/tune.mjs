// Choose tau on the TUNE split only, then record it. Reads p3_pair records (split "tune" and "test")
// from evidence/runs/p3.jsonl and appends one p3_pick record. The test split is never read here.
// Rule: the smallest tau at which the wrong-claim rate on tune is at most MAX_WRONG (default 2%),
// so that we claim as often as we can while keeping wrong claims rare. If no tau meets it, the
// largest tau tried is used and the record says so.
import { readFileSync, appendFileSync, existsSync } from "node:fs";

const FILE = "evidence/runs/p3.jsonl";
if (!existsSync(FILE)) { console.error(`${FILE} does not exist: run scripts/p3-run.mjs first`); process.exit(2); }
const MAX_WRONG = Number(process.env.MAX_WRONG ?? 0.02);
const tune = readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === "p3_pair" && r.split === "tune");
if (tune.length < 20) { console.error(`only ${tune.length} tune pairs; need at least 20`); process.exit(2); }
let chosen = null;
const rows = [];
for (let tau = 0.5; tau <= 0.995; tau += 0.005) {
  const claims = tune.filter((r) => r.m_same === "exact" && r.m_conf >= tau);
  const wrong = claims.filter((r) => r.label !== "exact").length;
  const truth = tune.filter((r) => r.label === "exact");
  const missed = truth.filter((r) => !(r.m_same === "exact" && r.m_conf >= tau)).length;
  const rate = claims.length ? wrong / claims.length : 0;
  rows.push({ tau: Number(tau.toFixed(3)), claims: claims.length, wrong, wrong_rate: rate, missed });
  if (chosen === null && rate <= MAX_WRONG && claims.length > 0) chosen = Number(tau.toFixed(3));
}
// A floor of 0.90: the threshold is never lower than the shipped default, so a match with nothing specific on the line (confidence 0.80) always goes to a person.
const FLOOR = 0.9;
const tau = Math.max(FLOOR, chosen ?? 0.99);
appendFileSync(FILE, JSON.stringify({ kind: "p3_pick", tau, tau_owed: 0.6, chosen_on: "tune", tune_n: tune.length, met_target: chosen !== null, floor: FLOOR, tuned: chosen, max_wrong: MAX_WRONG }) + "\n");
console.log(`tau = ${tau} chosen on ${tune.length} tune pairs${chosen === null ? " (target not met, largest tau used)" : ""}`);
console.table(rows.filter((_, i) => i % 10 === 0));

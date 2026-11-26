// The match decision: is this listing the same product and variant the customer bought? Salvor's own
// typed decision. Pinecone's embed and rerank give the evidence about the words; typed rules check what
// words cannot (size, capacity, model number, pack count). Only typed fields come in, never page text,
// and no amount is ever seen. Confidence is a rule score, not a calibrated probability, and the gate sends
// anything below its threshold to a person.
import type { SameItem } from "./policy/gate.ts";

export const LABEL = "Salvor match: Pinecone rerank plus typed-field rules";

export type MatchAnswer = {
  same: SameItem;
  sameConf: number;
  sameProbs: Record<string, number>;
  owedP: number;          // does the clause plausibly apply to this listing (rule score)
  model: string;
  usage: null;
  route: string;
  ms: number;
};

const UNIT = /(\d+(?:\.\d+)?)\s?(quarts?|qt|ounces?|oz|inch(?:es)?|in|pounds?|lbs?|lb|pack|pk|ct|count|gb|tb|ml|l|w|v|mah|piece|pc)\b/g;
const unitKey = (u: string) => ({ quart: "qt", quarts: "qt", ounce: "oz", ounces: "oz", inch: "in", inches: "in", pound: "lb", pounds: "lb", lbs: "lb", pk: "pack", count: "ct", pc: "piece" } as Record<string, string>)[u] ?? u;

// Every value of every unit in the text. A line may carry several (a 6 qt and a 2.5 qt basket).
export function units(text: string): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const x of text.toLowerCase().matchAll(UNIT)) { const k = unitKey(x[2]); (m.get(k) ?? m.set(k, new Set()).get(k)!).add(String(Number(x[1]))); }
  return m;
}
const STOP = new Set(["the", "a", "an", "and", "of", "with", "for", "in", "by", "to", "set", "new"]);
const words = (t: string) => t.toLowerCase().replace(UNIT, " ").replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 1 && !STOP.has(w));
const modelTokens = (t: string) => words(t).filter((w) => /[a-z]/.test(w) && /\d/.test(w) && w.length >= 3);

export function decideRules(line: { raw_text: string }, listing: { title: string; sku?: string | null; brand?: string | null }, rerank: number | null, t0 = Date.now()): MatchAnswer {
  const recText = line.raw_text, lisText = [listing.brand, listing.title, listing.sku].filter(Boolean).join(" ");
  const ru = units(recText), lu = units(lisText);
  let conflict: string | null = null, matched = 0;
  for (const [k, vals] of ru) {
    const have = lu.get(k);
    if (!have) continue;
    for (const v of vals) { if (have.has(v)) matched++; else conflict = `${k}: ${v} is not among ${[...have].join(", ")}`; }
  }
  const ruCount = [...ru.values()].reduce((n, v) => n + v.size, 0);
  const rw = words(recText), lw = new Set(words(lisText));
  const coverage = rw.length ? rw.filter((w) => lw.has(w)).length / rw.length : 0;
  const models = modelTokens(recText), modelsOk = models.every((m) => lisText.toLowerCase().includes(m));
  // Pinecone's rerank score is the semantic evidence. Without it (the rules-only baseline in the P3 ablation)
  // lexical word coverage stands in for it.
  const r = rerank ?? coverage;
  const unitsOk = ruCount === 0 || matched === ruCount;
  const thin = ruCount === 0 && models.length === 0;       // nothing specific to match on: a person decides
  let same: MatchAnswer["same"], conf: number, owed = 0.5;
  if (conflict) { same = "other_variant"; conf = 0.95; }
  else if (coverage === 1 && modelsOk && unitsOk && r >= 0.5) { same = "exact"; conf = thin ? 0.8 : models.length ? 0.96 : 0.93; owed = 0.9; }
  else if (coverage >= 0.6 && modelsOk && unitsOk && r >= 0.9) { same = "exact"; conf = 0.84; owed = 0.8; }
  else if (r < 0.3 || (coverage < 0.34 && r < 0.6)) { same = "other_product"; conf = 0.85; }
  else { same = "cannot_tell"; conf = 0.4; }
  return { same, sameConf: conf, sameProbs: { [same]: conf }, owedP: owed, model: LABEL, usage: null, route: "rules", ms: Date.now() - t0 };
}

export function decide(receiptLine: { raw_text: string }, listing: { title: string; sku?: string | null; brand?: string | null }, rerank: number | null): MatchAnswer {
  return decideRules(receiptLine, listing, rerank);
}

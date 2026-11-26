// The decision gate: turns the typed verdict (code) and the match answers (typed
// rule scores) plus any human confirmation into one of four states. A model never
// supplies an amount; this function never reads one.
import type { Verdict } from "./engine.ts";

export type SameItem = "exact" | "other_variant" | "other_product" | "cannot_tell";
export type Decision = "owed" | "not_owed" | "ask" | "stale";

export type Thresholds = { tau: number; tauOwed: number };
// Defaults are replaced by the values chosen on the tune split (see scripts/tune.mjs and
// evidence/labels). They live in code so a gate can never run without a number.
export const DEFAULT_THRESHOLDS: Thresholds = { tau: 0.9, tauOwed: 0.6 };

export type MatchRead = { same: SameItem; sameConf: number; owedP: number };

export type GateResult = { decision: Decision; why: string };

export function gate(
  verdict: Verdict,
  read: MatchRead | null,
  humanConfirmed: boolean,
  t: Thresholds = DEFAULT_THRESHOLDS,
): GateResult {
  if (verdict.status === "hold") {
    const stale = verdict.reasons.some((r) => /hours old/.test(r));
    return { decision: stale ? "stale" : "ask", why: verdict.reasons.join(" ") };
  }
  if (verdict.status === "not_owed") return { decision: "not_owed", why: verdict.reasons.join(" ") };
  // verdict.status === "owed": the clause and the numbers say money is owed. Is it the same item?
  if (humanConfirmed) return { decision: "owed", why: "You confirmed this is the same item." };
  if (read === null) return { decision: "ask", why: "No decision was returned for the item match." };
  for (const [name, v] of Object.entries({ sameConf: read.sameConf, owedP: read.owedP })) {
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`read ${name} out of range: ${v}`);
  }
  if (read.same === "exact" && read.sameConf >= t.tau) {
    if (read.owedP >= t.tauOwed) return { decision: "owed", why: `Same item at ${(read.sameConf * 100).toFixed(0)}% and the clause applies.` };
    return { decision: "ask", why: "Same item, but the clause may not apply to this listing." };
  }
  if ((read.same === "other_variant" || read.same === "other_product") && read.sameConf >= t.tau) {
    return { decision: "not_owed", why: `The listing is ${read.same === "other_variant" ? "a different variant" : "a different product"}.` };
  }
  return { decision: "ask", why: "Not sure the listing is the same item." };
}

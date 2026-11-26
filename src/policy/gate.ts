// The decision gate: turns the typed verdict (code) and the Jev answers (calibrated
// probabilities) plus any human confirmation into one of four states. A model never
// supplies an amount; this function never reads one.
import type { Verdict } from "./engine.ts";

export type SameItem = "exact" | "other_variant" | "other_product" | "cannot_tell";
export type Decision = "owed" | "not_owed" | "ask" | "stale";

export type Thresholds = { tau: number; tauOwed: number };
// Defaults are replaced by the values chosen on the tune split (see scripts/tune.mjs and
// evidence/labels). They live in code so a gate can never run without a number.
export const DEFAULT_THRESHOLDS: Thresholds = { tau: 0.9, tauOwed: 0.6 };

export type JevRead = { same: SameItem; sameConf: number; owedP: number };

export type GateResult = { decision: Decision; why: string };

export function gate(
  verdict: Verdict,
  jev: JevRead | null,
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
  if (jev === null) return { decision: "ask", why: "No decision was returned for the item match." };
  for (const [name, v] of Object.entries({ sameConf: jev.sameConf, owedP: jev.owedP })) {
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`jev ${name} out of range: ${v}`);
  }
  if (jev.same === "exact" && jev.sameConf >= t.tau) {
    if (jev.owedP >= t.tauOwed) return { decision: "owed", why: `Same item at ${(jev.sameConf * 100).toFixed(0)}% and the clause applies.` };
    return { decision: "ask", why: "Same item, but the clause may not apply to this listing." };
  }
  if ((jev.same === "other_variant" || jev.same === "other_product") && jev.sameConf >= t.tau) {
    return { decision: "not_owed", why: `The listing is ${jev.same === "other_variant" ? "a different variant" : "a different product"}.` };
  }
  return { decision: "ask", why: "Not sure the listing is the same item." };
}

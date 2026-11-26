// TypeSafe Jev: the decision. Typed fields in, typed answers with calibrated probabilities out.
// Jev never sees an amount and never sees raw page text: only the fields the receipt Sprite typed.
import { call } from "../gateway.ts";
import type { SameItem } from "../policy/gate.ts";

const CONN = "jev-eyes";
// Which route is live is decided by the probe (Q9). The documented shape is POST /v1/decisions.
export const ROUTES = ["/v1/decisions", "/v1/decide", "/v1/systemone"];

export type JevAnswer = {
  same: SameItem;
  sameConf: number;
  sameProbs: Record<string, number>;
  owedP: number;
  model: string;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  route: string;
  ms: number;
};

export const SAME_CRITERIA: Record<SameItem, string> = {
  exact: "Same brand, model and variant (size, capacity, colour, pack count).",
  other_variant: "Same model family but a different size, capacity, colour, pack count or bundle.",
  other_product: "A different product.",
  cannot_tell: "The fields do not allow a decision.",
};

export function buildRequest(receiptLine: object, listing: object, clauseText: string, model: string) {
  return {
    model,
    state: { receipt_line: receiptLine, listing, store_clause: clauseText },
    questions: {
      same_item: {
        type: "choice",
        instructions: "Is the listing the same product and variant the customer bought?",
        criteria: SAME_CRITERIA,
      },
      owed: {
        type: "noul",
        instructions:
          "Under this store clause, would this listing's current price entitle the customer to a price adjustment? Ignore the amount.",
      },
    },
  };
}

export function parseResponse(j: any): Omit<JevAnswer, "route" | "ms"> {
  const a = j?.answers;
  const s = a?.same_item, o = a?.owed;
  if (!s || s.type !== "choice" || typeof s.choice !== "string") throw new Error("jev response has no same_item choice");
  if (!["exact", "other_variant", "other_product", "cannot_tell"].includes(s.choice)) throw new Error(`jev returned unknown choice ${s.choice}`);
  const conf = Number(s.confidence);
  const owed = Number(o?.noul ?? o?.probability ?? o?.p);
  if (!Number.isFinite(conf) || conf < 0 || conf > 1) throw new Error("jev confidence out of range");
  if (!Number.isFinite(owed) || owed < 0 || owed > 1) throw new Error("jev owed probability out of range");
  return {
    same: s.choice as SameItem, sameConf: conf, sameProbs: s.probabilities ?? {}, owedP: owed,
    model: String(j.model ?? j.meta?.model ?? "jev"), usage: j.usage ?? null,
  };
}

export async function decide(receiptLine: object, listing: object, clause: { id: string; text: string }): Promise<JevAnswer> {
  const route = process.env.JEV_ROUTE ?? ROUTES[0];
  const model = process.env.JEV_MODEL ?? "typesafe/jev";
  const t0 = Date.now();
  const r = await call(CONN, "POST", route, buildRequest(receiptLine, listing, clause.text, model));
  const text = await r.text();
  if (!r.ok) throw new Error(`jev HTTP ${r.status}: ${text.slice(0, 200)}`);
  return { ...parseResponse(JSON.parse(text)), route, ms: Date.now() - t0 };
}

// Ollama Cloud: open models doing real work. Reads receipts (photo, PDF text, forwarded email)
// into structured lines, and writes the plain-words claim text. It never produces a number that
// a person acts on: amounts are inserted by code and checked by src/house/style.ts.
import { call } from "../gateway.ts";

const CONN = "ollama-hands";

export const TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL ?? "gpt-oss:120b";
export const VISION_MODEL = process.env.OLLAMA_VISION_MODEL ?? "gemma4:31b";

export type ReceiptLine = { raw_text: string; paid_cents: number; qty: number };
export type ReadReceipt = { retailer: string | null; purchased_date: string | null; order_total_cents: number | null; lines: ReceiptLine[]; model: string };

async function chat(model: string, messages: object[], format?: object, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await call(CONN, "POST", "/api/chat", { model, messages, stream: false, ...(format ? { format } : {}), options: { temperature: 0 }, ...extra }, {
    signal: AbortSignal.timeout(120_000),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`ollama HTTP ${r.status}: ${t.slice(0, 200)}`);
  const j = JSON.parse(t);
  return String(j.message?.content ?? "");
}

export async function models(): Promise<string[]> {
  const r = await call(CONN, "GET", "/api/tags");
  if (!r.ok) throw new Error(`ollama tags HTTP ${r.status}`);
  const j: any = await r.json();
  return (j.models ?? []).map((m: any) => String(m.name ?? m.model));
}

const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    retailer: { type: ["string", "null"] },
    purchased_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
    order_total: { type: ["string", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { raw_text: { type: "string" }, price: { type: "string" }, qty: { type: "integer" } },
        required: ["raw_text", "price", "qty"],
      },
    },
  },
  required: ["retailer", "purchased_date", "lines"],
};

const READ_PROMPT =
  "Read this receipt or order confirmation. Return JSON only. Copy each product line exactly as printed in raw_text. " +
  "price is the unit price as printed (digits and a decimal point only). qty defaults to 1. " +
  "purchased_date is YYYY-MM-DD or null. Do not guess anything that is not printed.";

function toLines(j: any, model: string): ReadReceipt {
  const lines: ReceiptLine[] = [];
  for (const l of j.lines ?? []) {
    const m = /^\$?\s*(\d+(?:\.\d{1,2})?)$/.exec(String(l.price ?? "").replace(/,/g, "").trim());
    if (!m || !l.raw_text) continue;                       // unreadable lines are dropped, never repaired
    lines.push({ raw_text: String(l.raw_text).slice(0, 160), paid_cents: Math.round(Number(m[1]) * 100), qty: Math.max(1, Number(l.qty) || 1) });
  }
  const date = typeof j.purchased_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.purchased_date) ? j.purchased_date : null;
  const tot = /^\$?\s*(\d+(?:\.\d{1,2})?)$/.exec(String(j.order_total ?? "").replace(/,/g, "").trim());
  return { retailer: j.retailer ?? null, purchased_date: date, order_total_cents: tot ? Math.round(Number(tot[1]) * 100) : null, lines, model };
}

export async function readReceiptImage(base64: string): Promise<ReadReceipt> {
  const out = await chat(VISION_MODEL, [{ role: "user", content: READ_PROMPT, images: [base64] }], RECEIPT_SCHEMA);
  return toLines(JSON.parse(out), VISION_MODEL);
}

export async function readReceiptText(text: string): Promise<ReadReceipt> {
  const out = await chat(TEXT_MODEL, [{ role: "user", content: `${READ_PROMPT}\n\n---\n${text.slice(0, 12000)}` }], RECEIPT_SCHEMA);
  return toLines(JSON.parse(out), TEXT_MODEL);
}

// Plain words about a claim. Numbers are passed in as already-formatted strings and the caller
// screens the draft so that no other amount can appear.
export async function claimWords(facts: { item: string; retailer: string; paid: string; now: string; owed: string; clause: string; purchased: string }): Promise<string> {
  const prompt =
    "Write a polite, plain claim message from a customer to a store's price match desk. Short sentences. No dashes, no hype, no emoji. " +
    "Use only these facts and these exact dollar amounts, and state no other amount.\n" + JSON.stringify(facts) +
    "\nAsk the store to match the lower price under the named policy. Offer the evidence link that will be added by the system. Under 120 words.";
  return (await chat(TEXT_MODEL, [{ role: "user", content: prompt }])).trim();
}

// Baseline for the ablation (P3): same question as Jev, answered by a plain LLM prompt.
export async function llmSameItem(line: object, listing: object): Promise<{ same: string; conf: number }> {
  const schema = {
    type: "object",
    properties: { same: { type: "string", enum: ["exact", "other_variant", "other_product", "cannot_tell"] }, confidence: { type: "number" } },
    required: ["same", "confidence"],
  };
  const out = await chat(TEXT_MODEL, [{
    role: "user",
    content: "Is the listing the same product and variant (size, capacity, colour, pack count) as the receipt line? Answer same as one of exact, other_variant, other_product, cannot_tell, and confidence from 0 to 1.\n" + JSON.stringify({ receipt_line: line, listing }),
  }], schema);
  const j = JSON.parse(out);
  return { same: String(j.same), conf: Math.min(1, Math.max(0, Number(j.confidence) || 0)) };
}

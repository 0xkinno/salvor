// Intake and the human loop, both over AgentMail.
//   1. A forwarded order confirmation becomes a receipt record (parsed by rules, no model).
//   2. A reply to one of Salvor's questions ("YES", "NO", "STORE") becomes a lasting fact.
// Only mail from the owner's address is trusted for replies and forwards. Everything else is ignored and logged.
import { db, event, kvGet, kvSet } from "./db.ts";
import * as mail from "../connectors/mail.ts";
import { addReceipt, answerAsk, type NewReceipt } from "./ledger.ts";
import { rememberConfirmed } from "./memory.ts";
import { parseCents } from "../policy/money.ts";

const TARGET_URL = /https:\/\/www\.target\.com\/p\/[^\s"'<>)]*A-\d{6,10}[^\s"'<>)]*/gi;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function retailerOf(text: string): "target" | "bestbuy" | null {
  const s = text.toLowerCase();
  if (s.includes("target")) return "target";
  if (s.includes("best buy") || s.includes("bestbuy")) return "bestbuy";
  return null;
}

export function productUrls(text: string): string[] {
  return [...new Set((text.match(TARGET_URL) ?? []).map((u) => u.replace(/[.,;]+$/, "")))];
}

// "Nov 9, 2026", "November 9 2026", "2026-11-09", "11/09/2026" -> YYYY-MM-DD
export function findDate(text: string): string | null {
  let m = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i.exec(text);
  if (m) return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/.exec(text);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

// Item lines: a description followed by a price, one per line. Totals, tax and shipping are skipped.
export function findLines(text: string): { raw_text: string; paid_cents: number; qty: number }[] {
  const out: { raw_text: string; paid_cents: number; qty: number }[] = [];
  for (const ln of text.split(/\r?\n/)) {
    const m = /^\s*(?:(\d{1,2})\s*[x×]\s*)?(.{6,120}?)[\s:.\-|]+\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{2}))\s*(?:each|ea)?\s*$/i.exec(ln);
    if (!m) continue;
    const desc = m[2].replace(/\s+/g, " ").trim();
    if (/\b(subtotal|total|tax|shipping|discount|savings|delivery|fee|balance|tip|order)\b/i.test(desc)) continue;
    try { out.push({ raw_text: desc.slice(0, 160), paid_cents: parseCents(m[3]), qty: Math.max(1, Number(m[1]) || 1) }); } catch { /* unreadable price: line skipped */ }
  }
  return out;
}

export function parseOrderEmail(text: string): NewReceipt | { skipped: string } {
  const retailer = retailerOf(text);
  if (!retailer) return { skipped: "the email does not name a store Salvor watches" };
  const date = findDate(text);
  if (!date) return { skipped: "no purchase date could be read" };
  const lines = findLines(text);
  if (!lines.length) return { skipped: "no item lines with a price could be read" };
  const urls = productUrls(text);
  return {
    retailer, channel: "online", purchased_date: date, source: "email", title: lines[0].raw_text,
    lines: lines.map((l, i) => ({ ...l, listing_url: urls.length === lines.length ? urls[i] : null })),
  };
}

// Reply parsing: the subject carries "[ask a-xxxxxxxx]"; the first word of the new text is the answer.
export function parseReply(subject: string, body: string): { ask: string; answer: "same" | "different" | "in_store" } | null {
  const id = /\[ask (a-[a-z0-9]{8})\]/i.exec(subject)?.[1];
  if (!id) return null;
  const first = body.replace(/^>.*$/gm, "").trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (["yes", "y", "same"].includes(first)) return { ask: id.toLowerCase(), answer: "same" };
  if (["no", "n", "different"].includes(first)) return { ask: id.toLowerCase(), answer: "different" };
  if (["store", "instore"].includes(first)) return { ask: id.toLowerCase(), answer: "in_store" };
  return null;
}

const fromOwner = (from: string | undefined) => {
  const a = (from ?? "").toLowerCase();
  return mail.allowedRecipients().some((o) => a.includes(o));
};

export type PollResult = { seen: number; receipts: string[]; answers: string[]; skipped: string[] };

export async function pollMail(inbox: string): Promise<PollResult> {
  const out: PollResult = { seen: 0, receipts: [], answers: [], skipped: [] };
  const msgs = await mail.listMessages(inbox);
  out.seen = msgs.length;
  for (const m of msgs) {
    if (kvGet(`mail:${m.message_id}`)) continue;
    kvSet(`mail:${m.message_id}`, "1");
    if (!fromOwner(m.from)) { out.skipped.push("not from the owner"); event("intake_ignored", { why: "sender is not the owner" }); continue; }
    const full = await mail.getMessage(inbox, m.message_id);
    const text = (full.text ?? full.html ?? "").slice(0, 20000);
    const reply = parseReply(full.subject ?? "", text);
    if (reply) {
      try { const lid = answerAsk(reply.ask, reply.answer); if (reply.answer === "same") void rememberConfirmed(lid); out.answers.push(`${reply.ask}:${reply.answer}`); } catch (e) { out.skipped.push(String((e as Error).message)); }
      continue;
    }
    const rec = parseOrderEmail(text);
    if ("skipped" in rec) { out.skipped.push(rec.skipped); event("intake_skipped", { why: rec.skipped }); continue; }
    out.receipts.push(addReceipt({ ...rec, household: "owner" }).receiptId);
  }
  return out;
}

export function openAskFor(lineId: string) {
  return db().prepare("SELECT * FROM asks WHERE line_id=? AND answered_at IS NULL").get(lineId);
}

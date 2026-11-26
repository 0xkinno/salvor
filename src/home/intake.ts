// Intake: receipts arrive by forwarded email (AgentMail) or by a photo or PDF dropped in Box
// (Salvor/Receipts). Ollama reads them into structured lines. A line becomes a receipt record,
// and a receipt Sprite is born for it.
import { inflateSync } from "node:zlib";
import { db, event, kvGet, kvSet } from "./db.ts";
import * as mail from "../connectors/mail.ts";
import * as box from "../connectors/box.ts";
import * as ollama from "../connectors/ollama.ts";
import { addReceipt, type NewReceipt } from "./ledger.ts";
import { parseCents } from "../policy/money.ts";

const TARGET_URL = /https:\/\/www\.target\.com\/p\/[^\s"'<>)]*A-\d{6,10}[^\s"'<>)]*/gi;

export function retailerOf(name: string | null): "target" | "bestbuy" | null {
  const s = (name ?? "").toLowerCase();
  if (s.includes("target")) return "target";
  if (s.includes("best buy") || s.includes("bestbuy")) return "bestbuy";
  return null;
}

export function productUrls(text: string): string[] {
  return [...new Set((text.match(TARGET_URL) ?? []).map((u) => u.replace(/[.,;]+$/, "")))];
}

// Best-effort text from a simple PDF (text streams, Flate). Used when the vision route is not the
// right tool; scanned PDFs still need the vision model and are reported as such.
export function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const out: string[] = [];
  let i = 0;
  while ((i = raw.indexOf("stream", i)) !== -1) {
    const start = raw[i + 6] === 0x0d ? i + 8 : i + 7;
    const end = raw.indexOf("endstream", start);
    if (end === -1) break;
    let data = raw.subarray(start, end);
    try { data = inflateSync(data); } catch { /* not compressed */ }
    const s = data.toString("latin1");
    for (const m of s.matchAll(/\(((?:\\.|[^\\)])*)\)\s*T[jJ]|\[((?:[^\]])*)\]\s*TJ/g)) {
      const piece = m[1] ?? [...(m[2] ?? "").matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((x) => x[1]).join("");
      if (piece) out.push(piece.replace(/\\([()\\])/g, "$1"));
    }
    i = end + 9;
  }
  return out.join("\n");
}

function toReceipt(read: ollama.ReadReceipt, source: string, urls: string[], extra: Partial<NewReceipt> = {}): NewReceipt | { skipped: string } {
  const retailer = retailerOf(read.retailer);
  if (!retailer) return { skipped: `retailer "${read.retailer ?? "unknown"}" is not one Salvor watches yet` };
  if (!read.purchased_date) return { skipped: "no purchase date could be read" };
  if (!read.lines.length) return { skipped: "no readable product lines" };
  return {
    retailer, channel: "online", purchased_date: read.purchased_date, source, ...extra,
    lines: read.lines.map((l, i) => ({ raw_text: l.raw_text, paid_cents: l.paid_cents, qty: l.qty, listing_url: urls.length === read.lines.length ? urls[i] : null })),
  };
}

export async function pollMail(inbox: string): Promise<{ seen: number; added: string[]; skipped: string[] }> {
  const added: string[] = [], skipped: string[] = [];
  const msgs = await mail.listMessages(inbox);
  for (const m of msgs) {
    if (kvGet(`mail:${m.message_id}`)) continue;
    kvSet(`mail:${m.message_id}`, "1");
    const full = await mail.getMessage(inbox, m.message_id);
    const text = (full.text ?? full.html ?? "").slice(0, 20000);
    const read = await ollama.readReceiptText(text);
    const rec = toReceipt(read, `email:${m.message_id.slice(0, 12)}`, productUrls(text), { title: read.lines[0]?.raw_text });
    if ("skipped" in rec) { skipped.push(rec.skipped); event("intake_skipped", { via: "mail", why: rec.skipped }); continue; }
    added.push(addReceipt(rec).receiptId);
  }
  return { seen: msgs.length, added, skipped };
}

export async function pollBox(): Promise<{ seen: number; added: string[]; skipped: string[] }> {
  const added: string[] = [], skipped: string[] = [];
  const folder = await box.ensurePath(["Salvor", "Receipts"]);
  const items = (await box.listFolder(folder)).filter((x) => x.type === "file");
  for (const f of items) {
    if (kvGet(`box:${f.id}`)) continue;
    kvSet(`box:${f.id}`, "1");
    const bytes = await box.download(f.id);
    const name = f.name.toLowerCase();
    let read: ollama.ReadReceipt;
    if (name.endsWith(".pdf")) {
      const t = pdfText(bytes);
      if (t.length < 40) { skipped.push(`${f.name}: scanned PDF with no text layer`); event("intake_skipped", { via: "box", file: f.id, why: "scanned pdf" }); continue; }
      read = await ollama.readReceiptText(t);
    } else read = await ollama.readReceiptImage(Buffer.from(bytes).toString("base64"));
    const rec = toReceipt(read, `box:${f.id}`, [], { box_file_id: f.id, channel: "store", title: read.lines[0]?.raw_text });
    if ("skipped" in rec) { skipped.push(`${f.name}: ${rec.skipped}`); event("intake_skipped", { via: "box", file: f.id, why: rec.skipped }); continue; }
    const r = addReceipt(rec);
    added.push(r.receiptId);
    try { await box.setDescription(f.id, `Salvor: watching ${rec.lines.length} item(s) as receipt ${r.receiptId}`); } catch { /* status write-back is best effort and the ledger keeps the truth */ }
  }
  return { seen: items.length, added, skipped };
}

export const looksLikePrice = (s: string) => { try { parseCents(s); return true; } catch { return false; } };

export function openAskFor(lineId: string) {
  return db().prepare("SELECT * FROM asks WHERE line_id=? AND answered_at IS NULL").get(lineId);
}

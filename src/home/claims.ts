// Claim packets. The amount comes from the policy engine, the words from Ollama (screened), the
// evidence from a platform checkpoint. Approval is bound to a digest of exactly what was shown
// and is single use.
import { createHash, randomUUID } from "node:crypto";
import { db, event } from "./db.ts";
import { clauseById } from "../policy/engine.ts";
import { fmt } from "../policy/money.ts";
import { screenModelText } from "../house/style.ts";
import { makePdf } from "./pdf.ts";

export type Packet = {
  claim_id: string;
  retailer: string;
  item: string;
  raw_line: string;
  purchased_date: string;
  qty: number;
  paid_cents: number;
  now_cents: number;
  owed_cents: number;
  clause: { id: string; title: string; text: string; source_url: string; checked: string; requires: string[]; ask_via: string; window_note: string };
  deadline: string;
  evidence: { sprite: string; checkpoint: string | null; sha256: string; day: string; apify_run_id: string; observed_at: string };
  words: string;
  words_source: string;
};

const canon = (o: unknown): string => JSON.stringify(o, Object.keys(flatKeys(o)).sort());
function flatKeys(o: unknown, acc: Record<string, 1> = {}): Record<string, 1> {
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { acc[k] = 1; flatKeys(v, acc); }
  return acc;
}
export const digestOf = (p: Packet) => createHash("sha256").update(canon(p)).digest("hex");

export function templateWords(p: Pick<Packet, "item" | "purchased_date" | "paid_cents" | "now_cents" | "owed_cents" | "retailer"> & { clauseTitle: string }): string {
  const store = p.retailer === "target" ? "Target" : "Best Buy";
  return (
    `Hello ${store} price match team. I bought ${p.item} on ${p.purchased_date} for ${fmt(p.paid_cents)}. ` +
    `The same item is now listed for ${fmt(p.now_cents)}. Under ${p.clauseTitle}, I am asking for a price match of ${fmt(p.owed_cents)}. ` +
    `My receipt and a dated record of the lower price are attached through the evidence link. Thank you.`
  );
}

// The claim words are written by code from the ledger. No model drafts them, so no amount can appear that the
// ledger does not hold; the house screen still runs over the result as a check.
export function writeWords(p: Omit<Packet, "words" | "words_source">): { words: string; source: string } {
  const clause = clauseById(p.clause.id);
  const words = templateWords({ ...p, clauseTitle: clause.title });
  const s = screenModelText(words, [p.paid_cents, p.now_cents, p.owed_cents]);
  if (!s.ok) throw new Error(`claim words failed the house screen: ${s.reasons.join("; ")}`);
  return { words: s.text, source: "written by code from the ledger; amounts checked against it" };
}

export function renderHtml(p: Packet, boxLink: string | null, digest: string): string {
  const e = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Price match claim ${e(p.claim_id)}</title>
<style>body{font:16px/1.55 Georgia,serif;color:#17132B;background:#fff;max-width:720px;margin:32px auto;padding:0 20px}
h1{font-size:28px;margin:0 0 4px}.m{font:13px ui-monospace,monospace;color:#5C566F;word-break:break-all}
table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border-bottom:1px solid #E2DCD2;padding:8px 6px;text-align:left}
.owed{color:#0B6648;font-weight:700}.box{background:#F5F1FE;padding:12px 16px;border-radius:10px}</style></head><body>
<h1>Price match request</h1><p class="m">Claim ${e(p.claim_id)} &middot; prepared by Salvor</p>
<p>${e(p.words)}</p>
<table><tr><th>Item</th><td>${e(p.item)}</td></tr>
<tr><th>Receipt line</th><td class="m">${e(p.raw_line)}</td></tr>
<tr><th>Purchased</th><td>${e(p.purchased_date)} (quantity ${p.qty})</td></tr>
<tr><th>Paid, each</th><td>${fmt(p.paid_cents)}</td></tr>
<tr><th>Listed now</th><td>${fmt(p.now_cents)}, read ${e(p.evidence.observed_at)}</td></tr>
<tr><th>Difference requested</th><td class="owed">${fmt(p.owed_cents)}</td></tr></table>
<h2>The policy</h2><p><em>${e(p.clause.text)}</em></p><p class="m">${e(p.clause.title)} &middot; ${e(p.clause.source_url)} &middot; checked ${e(p.clause.checked)}</p>
<p>${e(p.clause.window_note)}</p>
<h2>Proof the store asks for</h2><ul>${p.clause.requires.map((r) => `<li>${e(r)}</li>`).join("")}</ul>
<h2>Evidence</h2><p class="m">Sprite ${e(p.evidence.sprite)} &middot; checkpoint ${e(p.evidence.checkpoint ?? "none")} &middot; day ${e(p.evidence.day)}<br>sha256 ${e(p.evidence.sha256)}<br>Apify run ${e(p.evidence.apify_run_id)}</p>
${boxLink ? `<p class="box">Evidence folder: <a href="${e(boxLink)}">${e(boxLink)}</a></p>` : ""}
<p><strong>Where to ask:</strong> ${e(p.clause.ask_via)}</p>
<p class="m">Packet digest ${e(digest)}</p></body></html>`;
}

export function renderPdf(p: Packet, boxLink: string | null, digest: string): Uint8Array {
  return makePdf([
    { text: "Price match request", size: 22, bold: true, gap: 8 },
    { text: `Claim ${p.claim_id}. Prepared by Salvor.`, size: 9, mono: true, gap: 10 },
    { text: p.words, size: 11, gap: 10 },
    { text: `Item: ${p.item}`, bold: true },
    { text: `Receipt line: ${p.raw_line}`, mono: true, size: 9 },
    { text: `Purchased: ${p.purchased_date}, quantity ${p.qty}` },
    { text: `Paid, each: ${fmt(p.paid_cents)}` },
    { text: `Listed now: ${fmt(p.now_cents)} (read ${p.evidence.observed_at})` },
    { text: `Difference requested: ${fmt(p.owed_cents)}`, bold: true, gap: 10 },
    { text: "The policy", bold: true, size: 13 },
    { text: p.clause.text, gap: 2 },
    { text: `${p.clause.title}. ${p.clause.source_url}. Checked ${p.clause.checked}.`, size: 8, mono: true, gap: 2 },
    { text: p.clause.window_note, size: 10, gap: 8 },
    { text: "Proof the store asks for", bold: true, size: 13 },
    ...p.clause.requires.map((r) => ({ text: `- ${r}`, size: 10 })),
    { text: "Evidence", bold: true, size: 13 },
    { text: `Sprite ${p.evidence.sprite}, checkpoint ${p.evidence.checkpoint ?? "none"}, day ${p.evidence.day}`, size: 9, mono: true },
    { text: `sha256 ${p.evidence.sha256}`, size: 8, mono: true },
    { text: `Apify run ${p.evidence.apify_run_id}`, size: 9, mono: true },
    ...(boxLink ? [{ text: `Evidence folder: ${boxLink}`, size: 9, mono: true }] : []),
    { text: `Where to ask: ${p.clause.ask_via}`, size: 10, gap: 8 },
    { text: `Packet digest ${digest}`, size: 8, mono: true },
  ]);
}

// Three lines Teresa can say at Guest Services or paste into chat.
export function chatScript(p: Packet, boxLink: string | null): string[] {
  const store = p.retailer === "target" ? "Target" : "Best Buy";
  return [
    `I bought ${p.item} on ${p.purchased_date} for ${fmt(p.paid_cents)}. It is now ${fmt(p.now_cents)} at ${store}.`,
    `Under ${p.clause.title} I am asking for a price match of ${fmt(p.owed_cents)}.`,
    boxLink ? `My receipt and the dated proof are here: ${boxLink}` : "I have my receipt and a dated screenshot of the lower price.",
  ];
}

export function issueApproval(claimId: string, digest: string) {
  db().prepare("INSERT OR IGNORE INTO approvals (digest, claim_id, issued_at, used_at) VALUES (?,?,?,NULL)").run(digest, claimId, new Date().toISOString());
}

export type ApproveResult = { ok: true } | { ok: false; why: string };

// Single use, and bound to exactly the packet that was displayed.
export function consumeApproval(claimId: string, echoedDigest: string): ApproveResult {
  const claim = db().prepare("SELECT digest, approved_at FROM claims WHERE id=?").get(claimId) as { digest: string; approved_at: string | null } | undefined;
  if (!claim) return { ok: false, why: "unknown claim" };
  if (claim.approved_at) return { ok: false, why: "already approved" };
  if (claim.digest !== echoedDigest) return { ok: false, why: "the claim changed since it was shown to you; open it again" };
  const row = db().prepare("SELECT used_at FROM approvals WHERE digest=? AND claim_id=?").get(echoedDigest, claimId) as { used_at: string | null } | undefined;
  if (!row) return { ok: false, why: "no approval was issued for this digest" };
  if (row.used_at) return { ok: false, why: "this approval was already used" };
  const now = new Date().toISOString();
  db().prepare("UPDATE approvals SET used_at=? WHERE digest=? AND claim_id=? AND used_at IS NULL").run(now, echoedDigest, claimId);
  db().prepare("UPDATE claims SET approved_at=? WHERE id=?").run(now, claimId);
  event("claim_approved", { claim: claimId, digest: echoedDigest });
  return { ok: true };
}

export const newClaimId = () => "c-" + randomUUID().slice(0, 8);

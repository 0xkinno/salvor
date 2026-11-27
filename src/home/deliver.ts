// Delivery, all over AgentMail. Salvor writes to the owner when a claim is ready or when it needs one
// answer, and it sends the approved claim to the owner's own address. During the hackathon nothing is ever
// sent to a store. The claim itself is served at /claims/<id> (HTML and PDF), the page a store would open.
import { db, event } from "./db.ts";
import { packetOf } from "./ledger.ts";
import { chatScript, renderHtml } from "./claims.ts";
import * as mail from "../connectors/mail.ts";
import { fmt } from "../policy/money.ts";

const appUrl = () => (process.env.SALVOR_URL ?? "").replace(/\/$/, "");

// A notification counts as delivered only when its recorded result says ok. Earlier failures are retried.
function delivered(key: string): boolean {
  const r = db().prepare("SELECT v FROM kv WHERE k=?").get(key) as { v: string } | undefined;
  if (!r) return false;
  try { return Boolean(JSON.parse(r.v).ok); } catch { return false; }
}

export type Sent = { channel: "email" | "script"; to?: string; script: string[]; note: string };

async function sendToOwner(subject: string, text: string, html?: string): Promise<{ ok: boolean; to?: string; error?: string }> {
  const to = mail.allowedRecipients()[0], inbox = process.env.SALVOR_INBOX;
  if (!to || !inbox) return { ok: false, error: "no inbox or owner address is configured" };
  try { await mail.send(inbox, to, subject, text, html); return { ok: true, to }; }
  catch (e) { return { ok: false, to, error: String((e as Error).message).slice(0, 120) }; }
}

// "Target owes you $12.00": sent the moment a claim is prepared.
export async function notifyClaimReady(claimId: string) {
  const claim = db().prepare("SELECT * FROM claims WHERE id=?").get(claimId) as any;
  const p = packetOf(claimId);
  if (!claim || !p) return;
  if (delivered(`notified:${claimId}`)) return;
  const line = db().prepare("SELECT receipt_id FROM lines WHERE id=?").get(claim.line_id) as { receipt_id: string };
  const text =
    `${p.retailer === "target" ? "Target" : "Best Buy"} owes you ${fmt(claim.amount_cents)} on ${p.item}.\n` +
    `You paid ${fmt(p.paid_cents)} and it is now ${fmt(p.now_cents)}. The window closes ${claim.deadline}.\n\n` +
    `Review and approve: ${appUrl()}/app/r/${line.receipt_id}\nThe claim as the store sees it: ${appUrl()}/claims/${claimId}\n`;
  const r = await sendToOwner(`Money owed: ${fmt(claim.amount_cents)} on ${p.item}`, text);
  if (r.ok) db().prepare("INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)").run(`notified:${claimId}`, JSON.stringify(r));   // a failed send is retried by the sweep
  event("notify_claim", { claim: claimId, ok: r.ok, error: r.error });
}

// One question, only when it matters. Reply YES, NO or STORE; the reply is read by pollMail.
export async function notifyAsk(askId: string) {
  const a = db().prepare("SELECT a.*, l.raw_text, l.paid_cents, r.title FROM asks a JOIN lines l ON l.id=a.line_id JOIN receipts r ON r.id=l.receipt_id WHERE a.id=?").get(askId) as any;
  if (!a || a.answered_at) return;
  if (delivered(`notified:${askId}`)) return;
  const cand = JSON.parse((db().prepare("SELECT v FROM kv WHERE k=?").get(`cand:${a.line_id}`) as { v: string } | undefined)?.v ?? "[]")[0];
  const text =
    `${a.question}\n\nYou bought: ${a.raw_text} for ${fmt(a.paid_cents)}.\n` +
    (cand ? `Salvor found: ${cand.title}\n` : "") +
    `\nReply YES if it is the same item, NO if it is a different one, or STORE if you bought it in a store.\n` +
    `Or answer in the app: ${appUrl()}/app\n`;
  const r = await sendToOwner(`One question about ${a.title} [ask ${askId}]`, text);
  if (r.ok) db().prepare("INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)").run(`notified:${askId}`, JSON.stringify(r));
  event("notify_ask", { ask: askId, ok: r.ok, error: r.error });
}

// After approval: the full claim goes to the owner's own address, with the three line script.
export async function sendClaim(claimId: string): Promise<Sent> {
  const claim = db().prepare("SELECT * FROM claims WHERE id=?").get(claimId) as any;
  const p = packetOf(claimId)!;
  const link = `${appUrl()}/claims/${claimId}`;
  const script = chatScript(p, link);
  const r = await sendToOwner(`Price match request ${claimId}: ${p.item}`, p.words + "\n\n" + script.join("\n") + `\n\nClaim page: ${link}`, renderHtml(p, link, claim.digest));
  if (r.ok) {
    db().prepare("UPDATE claims SET sent_at=?, channel='email' WHERE id=?").run(new Date().toISOString(), claimId);
    event("claim_sent", { claim: claimId, channel: "email" });
    return { channel: "email", to: r.to, script, note: "emailed to the owner's test inbox. Nothing is ever sent to a store during the hackathon." };
  }
  db().prepare("UPDATE claims SET channel='script' WHERE id=?").run(claimId);
  return { channel: "script", script, note: `email was not sent (${r.error}); here is the script to say or paste at the store` };
}

// Resend anything that was prepared but not yet delivered to the owner. Safe to run often: a delivered item is skipped.
export async function sweepNotifications() {
  for (const c of db().prepare("SELECT id FROM claims WHERE approved_at IS NULL").all() as { id: string }[]) await notifyClaimReady(c.id);
  for (const a of db().prepare("SELECT id FROM asks WHERE answered_at IS NULL").all() as { id: string }[]) await notifyAsk(a.id);
}

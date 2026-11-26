// AgentMail: the receipts inbox (forward order confirmations to it) and the claim email channel.
// During the hackathon a claim email goes to the owner's own test inbox only, never to a store.
import { json } from "../gateway.ts";

const CONN = "mail-hands";

export type Msg = { message_id: string; from?: string; subject?: string; text?: string; html?: string; timestamp?: string; created_at?: string };

export function allowedRecipients(): string[] {
  return (process.env.SALVOR_TEST_INBOX ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function whoami() { return json(CONN, "GET", "/v0/auth/me"); }

export async function listMessages(inbox: string, limit = 25): Promise<Msg[]> {
  const j: any = await json(CONN, "GET", `/v0/inboxes/${encodeURIComponent(inbox)}/messages?limit=${limit}`);
  return j.messages ?? [];
}

export async function getMessage(inbox: string, id: string): Promise<Msg> {
  return json(CONN, "GET", `/v0/inboxes/${encodeURIComponent(inbox)}/messages/${encodeURIComponent(id)}`);
}

export async function send(inbox: string, to: string, subject: string, text: string, html?: string) {
  const ok = allowedRecipients();
  if (!ok.includes(to.toLowerCase())) throw new Error(`refusing to send to ${to}: only the configured test inbox may receive mail during the hackathon`);
  return json(CONN, "POST", `/v0/inboxes/${encodeURIComponent(inbox)}/messages/send`, { to: [to], subject, text, ...(html ? { html } : {}) });
}

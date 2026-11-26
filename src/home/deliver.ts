// Delivery. Filing in Box happens when the claim is prepared, so the packet and its evidence are
// already in Teresa's Box when she opens the card. Sending happens only after her digest-bound
// approval, and only to the owner's test inbox during the hackathon.
import { db, event } from "./db.ts";
import { packetOf } from "./ledger.ts";
import { chatScript, renderHtml, renderPdf } from "./claims.ts";
import * as box from "../connectors/box.ts";
import * as mail from "../connectors/mail.ts";
import * as sprites from "../connectors/sprites.ts";

const enc = new TextEncoder();

export type Filing = { ok: boolean; folder_id?: string; link?: string; files?: string[]; note: string };

export async function fileClaimInBox(claimId: string): Promise<Filing> {
  const claim = db().prepare("SELECT * FROM claims WHERE id=?").get(claimId) as any;
  const p = packetOf(claimId);
  if (!claim || !p) return { ok: false, note: "unknown claim" };
  try {
    const folder = await box.ensurePath(["Salvor", "Claims", claimId]);
    const html = enc.encode(renderHtml(p, null, claim.digest));
    const files = [await box.upload(folder, "claim.html", html, "text/html"), await box.upload(folder, "claim.pdf", renderPdf(p, null, claim.digest), "application/pdf")];
    // The evidence file is copied from the receipt Sprite's own disk so the Box folder is complete.
    try {
      const ev = await sprites.readFile(p.evidence.sprite, `/home/sprite/salvor/evidence/${p.evidence.day}.json`);
      files.push(await box.upload(folder, `evidence-${p.evidence.day}.json`, ev, "application/json"));
    } catch { /* the packet still cites the checkpoint copy */ }
    const link = await box.sharedLink("folders", folder);
    db().prepare("UPDATE claims SET box_folder_id=?, shared_link=? WHERE id=?").run(folder, link, claimId);
    event("claim_filed_in_box", { claim: claimId, folder, files: files.length });
    return { ok: true, folder_id: folder, link, files: files.map((f) => f.name), note: "filed in Box" };
  } catch (e) {
    const note = `Box filing failed: ${String((e as Error).message).slice(0, 160)}`;
    event("claim_box_failed", { claim: claimId, note });
    return { ok: false, note };
  }
}

export type Sent = { channel: "email" | "script"; to?: string; script: string[]; note: string };

export async function sendClaim(claimId: string): Promise<Sent> {
  const claim = db().prepare("SELECT * FROM claims WHERE id=?").get(claimId) as any;
  const p = packetOf(claimId)!;
  const script = chatScript(p, claim.shared_link ?? null);
  const to = mail.allowedRecipients()[0];
  const inbox = process.env.SALVOR_INBOX;
  if (to && inbox) {
    try {
      await mail.send(inbox, to, `Price match request ${claimId}: ${p.item}`, p.words + "\n\n" + script.join("\n") + `\n\nEvidence: ${claim.shared_link ?? "see the claim page"}`, renderHtml(p, claim.shared_link ?? null, claim.digest));
      db().prepare("UPDATE claims SET sent_at=?, channel='email' WHERE id=?").run(new Date().toISOString(), claimId);
      event("claim_sent", { claim: claimId, channel: "email" });
      return { channel: "email", to, script, note: "emailed to the owner's test inbox. Nothing is ever sent to a store during the hackathon." };
    } catch (e) {
      db().prepare("UPDATE claims SET channel='script' WHERE id=?").run(claimId);
      return { channel: "script", script, note: `email failed (${String((e as Error).message).slice(0, 100)}); here is the script to say or paste instead` };
    }
  }
  db().prepare("UPDATE claims SET channel='script' WHERE id=?").run(claimId);
  return { channel: "script", script, note: "no test inbox is configured, so here is the script to say or paste at the store" };
}

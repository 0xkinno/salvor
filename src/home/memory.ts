// Household memory. When a person confirms "yes, that is the same item", the receipt line and the listing they
// confirmed are stored in Pinecone's household namespace. The next receipt with a similar line is recognised from
// that memory before any search. Only human-confirmed items are stored.
import { db, event } from "./db.ts";
import * as pinecone from "../connectors/pinecone.ts";

export async function rememberConfirmed(lineId: string) {
  try {
    const line = db().prepare("SELECT raw_text FROM lines WHERE id=?").get(lineId) as { raw_text: string } | undefined;
    const cand = db().prepare("SELECT v FROM kv WHERE k=?").get(`cand:${lineId}`) as { v: string } | undefined;
    let top = cand ? JSON.parse(cand.v)[0] : null;
    if (!top) {   // no search candidate: the confirmed listing is the one the receipt is watching
      const l = db().prepare("SELECT l.listing_url, r.title FROM lines l JOIN receipts r ON r.id=l.receipt_id WHERE l.id=?").get(lineId) as { listing_url: string | null; title: string } | undefined;
      if (l?.listing_url) top = { id: l.listing_url, url: l.listing_url, title: l.title };
    }
    if (!line || !top) return event("memory_skipped", { line: lineId, why: "no confirmed listing to store" });
    if (!(await pinecone.memoryConnected("write"))) return event("memory_skipped", { line: lineId, why: "the household memory connection is not granted" });
    await pinecone.rememberItem(lineId, line.raw_text, String(top.id ?? top.url ?? lineId), String(top.title ?? ""));
    db().prepare("INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)").run(`remembered:${lineId}`, new Date().toISOString());
    event("memory_remembered", { line: lineId, title: top.title });
  } catch (e) { event("memory_failed", { line: lineId, error: String((e as Error).message).slice(0, 140) }); }
}

// Anything confirmed by a person but not yet stored is stored on the next sweep.
export async function sweepMemory() {
  const rows = db().prepare("SELECT DISTINCT line_id FROM asks WHERE answer='same'").all() as { line_id: string }[];
  for (const r of rows) {
    if (db().prepare("SELECT 1 x FROM kv WHERE k=?").get(`remembered:${r.line_id}`)) continue;
    await rememberConfirmed(r.line_id);
  }
}

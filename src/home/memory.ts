// Household memory. When a person confirms "yes, that is the same item", the receipt line and the listing they
// confirmed are stored in Pinecone's household namespace. The next receipt with a similar line is recognised from
// that memory before any search. Only human-confirmed items are stored.
import { db, event } from "./db.ts";
import * as pinecone from "../connectors/pinecone.ts";

export async function rememberConfirmed(lineId: string) {
  try {
    const line = db().prepare("SELECT raw_text FROM lines WHERE id=?").get(lineId) as { raw_text: string } | undefined;
    const cand = db().prepare("SELECT v FROM kv WHERE k=?").get(`cand:${lineId}`) as { v: string } | undefined;
    const top = cand ? JSON.parse(cand.v)[0] : null;
    if (!line || !top) return event("memory_skipped", { line: lineId, why: "no confirmed listing to store" });
    if (!(await pinecone.memoryConnected("write"))) return event("memory_skipped", { line: lineId, why: "the household memory connection is not granted" });
    await pinecone.rememberItem(lineId, line.raw_text, String(top.id ?? top.url ?? lineId), String(top.title ?? ""));
    event("memory_remembered", { line: lineId, title: top.title });
  } catch (e) { event("memory_failed", { line: lineId, error: String((e as Error).message).slice(0, 140) }); }
}

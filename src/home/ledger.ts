// The ledger: receipts, lines, observations, asks, claims. Pure database logic plus the policy
// engine and the gate. No network here, so it is fully testable.
import { randomUUID } from "node:crypto";
import { db, event } from "./db.ts";
import { applicableClauses, evaluate, clauseById, type Line, type TypedListing, type Verdict } from "../policy/engine.ts";
import { gate, DEFAULT_THRESHOLDS, type Decision, type Thresholds, type MatchRead } from "../policy/gate.ts";
import { digestOf, issueApproval, newClaimId, writeWords, type Packet } from "./claims.ts";
import type { Report } from "../receipt/observe.ts";

export type NewReceipt = {
  id?: string; retailer: "target" | "bestbuy"; channel: "online" | "store"; purchased_date: string; source: string;
  title?: string; household?: string; box_file_id?: string;
  lines: { raw_text: string; paid_cents: number; qty?: number; listing_url?: string | null; confirmed_by_human?: boolean }[];
};

export const shortId = () => randomUUID().replace(/-/g, "").slice(0, 3).toUpperCase() + randomUUID().replace(/-/g, "").slice(0, 1).toUpperCase();

export function addReceipt(r: NewReceipt): { receiptId: string; lineIds: string[] } {
  const id = r.id ?? shortId();
  const line: Line = { paid_cents: r.lines[0].paid_cents, qty: r.lines[0].qty ?? 1, purchased_date: r.purchased_date, retailer: r.retailer };
  const ends = applicableClauses(line).map((a) => a.ends.getTime());
  const windowEnds = ends.length ? new Date(Math.max(...ends)).toISOString() : new Date(0).toISOString();
  const now = new Date().toISOString();
  db().prepare(
    "INSERT INTO receipts (id,retailer,channel,purchased_at,source,box_file_id,sprite,status,window_ends_at,created_at,title,household) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, r.retailer, r.channel, r.purchased_date, r.source, r.box_file_id ?? null, null, ends.length ? "new" : "no_window", windowEnds, now, r.title ?? r.lines[0].raw_text, r.household ?? "sample");
  const lineIds: string[] = [];
  for (const l of r.lines) {
    const lid = `${id}-${lineIds.length + 1}`;
    db().prepare("INSERT INTO lines (id,receipt_id,raw_text,paid_cents,qty,listing_url,listing_id,confirmed_by_human) VALUES (?,?,?,?,?,?,?,?)")
      .run(lid, id, l.raw_text, l.paid_cents, l.qty ?? 1, l.listing_url ?? null, null, l.confirmed_by_human ? 1 : 0);
    lineIds.push(lid);
  }
  event("receipt_added", { id, retailer: r.retailer, source: r.source, lines: lineIds.length });
  return { receiptId: id, lineIds };
}

export function setSprite(receiptId: string, sprite: string, status = "watching") {
  db().prepare("UPDATE receipts SET sprite=?, status=? WHERE id=?").run(sprite, status, receiptId);
}

export function lineRow(lineId: string): any {
  return db().prepare("SELECT l.*, r.retailer, r.purchased_at, r.sprite, r.window_ends_at, r.title, r.id AS rid FROM lines l JOIN receipts r ON r.id=l.receipt_id WHERE l.id=?").get(lineId);
}

export function watching(): any[] {
  return db().prepare("SELECT l.id AS line_id, r.* FROM receipts r JOIN lines l ON l.receipt_id=r.id WHERE r.status IN ('watching','asking','owed') AND r.sprite IS NOT NULL AND l.listing_url IS NOT NULL AND l.listing_url != ''").all();
}

export type Ingested = { decision: Decision; why: string; observation_id: string; claim_id: string | null; ask_id: string | null; verdict: Verdict | null };

export async function ingestReport(
  lineId: string, report: Report, opts: { now?: Date; thresholds?: Thresholds } = {},
): Promise<Ingested> {
  const now = opts.now ?? new Date();
  const line = lineRow(lineId);
  if (!line) throw new Error(`unknown line ${lineId}`);
  const obsId = "o-" + randomUUID().slice(0, 8);
  const common = [obsId, lineId, report.observed_at];

  if (report.decision !== "observed" || !report.listing) {
    const dec: Decision = report.decision === "stale" ? "stale" : "ask";
    db().prepare(
      `INSERT INTO observations (id,line_id,observed_at,apify_run_id,decision,why) VALUES (?,?,?,?,?,?)`,
    ).run(...common, report.run_id, dec, report.reason ?? "no reading");
    event("observation", { obs: obsId, line: lineId, decision: dec, why: report.reason });
    return { decision: dec, why: report.reason ?? "", observation_id: obsId, claim_id: null, ask_id: null, verdict: null };
  }

  const l = report.listing;
  const typed: TypedListing = { price_cents: l.price_cents, regular_cents: l.regular_cents, seller: l.seller, in_stock: l.in_stock, flags: l.flags, observed_at: report.observed_at };
  const verdict = evaluate({ paid_cents: line.paid_cents, qty: line.qty, purchased_date: line.purchased_at, retailer: line.retailer }, typed, now);
  const read: MatchRead | null = report.read && !("error" in report.read) ? { same: report.read.same, sameConf: report.read.sameConf, owedP: report.read.owedP } : null;
  const g = gate(verdict, read, Boolean(line.confirmed_by_human), opts.thresholds ?? DEFAULT_THRESHOLDS);

  db().prepare(
    `INSERT INTO observations (id,line_id,observed_at,price_cents,regular_cents,seller,in_stock,apify_run_id,checkpoint_id,evidence_sha256,evidence_day,
      m_same,m_conf,m_clause_p,decision,why,owed_cents,clause_id,deadline,m_model) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(...common, l.price_cents, l.regular_cents, l.seller, l.in_stock === null ? null : l.in_stock ? 1 : 0, report.run_id, report.checkpoint ?? null,
    report.sha256 ?? null, report.evidence_day ?? null, read?.same ?? null, read?.sameConf ?? null, read?.owedP ?? null, g.decision, g.why,
    verdict.owed_cents, verdict.clause_id, verdict.deadline, report.read && !("error" in report.read) ? report.read.model : null);
  event("observation", { obs: obsId, line: lineId, decision: g.decision, owed_cents: verdict.owed_cents });

  let claimId: string | null = null, askId: string | null = null;
  if (g.decision === "owed" && verdict.owed_cents > 0 && verdict.clause_id && verdict.deadline) {
    claimId = await createClaim(lineId, obsId, verdict, report, line);
    // A ready claim supersedes an open question. This records no human fact: only a person's answer does.
    db().prepare("UPDATE asks SET answered_at=?, answer='superseded' WHERE line_id=? AND answered_at IS NULL").run(now.toISOString(), lineId);
    db().prepare("UPDATE receipts SET status='owed' WHERE id=?").run(line.rid);
  } else if (g.decision === "ask") {
    askId = maybeAsk(lineId, line, verdict, now);
    if (askId) db().prepare("UPDATE receipts SET status='asking' WHERE id=?").run(line.rid);
  } else if (g.decision === "not_owed") {
    db().prepare("UPDATE receipts SET status='watching' WHERE id=? AND status IN ('new','owed','asking')").run(line.rid);
  }
  return { decision: g.decision, why: g.why, observation_id: obsId, claim_id: claimId, ask_id: askId, verdict };
}

// Interruption budget: at most one question per line per day, unless the window closes in 48 hours.
function maybeAsk(lineId: string, line: any, verdict: Verdict, now: Date): string | null {
  const day = now.toISOString().slice(0, 10);
  const open = db().prepare("SELECT id FROM asks WHERE line_id=? AND answered_at IS NULL").get(lineId) as { id: string } | undefined;
  if (open) return open.id;
  const today = db().prepare("SELECT COUNT(*) c FROM asks WHERE line_id=? AND substr(asked_at,1,10)=?").get(lineId, day) as { c: number };
  const urgent = verdict.hours_left !== null && verdict.hours_left <= 48;
  if (today.c >= 1 && !urgent) return null;
  const id = "a-" + randomUUID().slice(0, 8);
  const q = "Is this the same item you bought, with the same size or capacity?";
  db().prepare("INSERT INTO asks (id,line_id,question,options,asked_at) VALUES (?,?,?,?,?)").run(id, lineId, q, JSON.stringify(["same", "different", "in_store"]), now.toISOString());
  event("ask", { ask: id, line: lineId });
  return id;
}

async function createClaim(lineId: string, obsId: string, verdict: Verdict, report: Report, line: any): Promise<string> {
  const existing = db().prepare("SELECT id FROM claims WHERE line_id=? AND approved_at IS NULL ORDER BY created_at DESC LIMIT 1").get(lineId) as { id: string } | undefined;
  const clause = clauseById(verdict.clause_id!);
  const claimId = existing?.id ?? newClaimId();
  const l = report.listing!;
  const base: Omit<Packet, "words" | "words_source"> = {
    claim_id: claimId, retailer: line.retailer, item: l.title, raw_line: line.raw_text, purchased_date: line.purchased_at, qty: line.qty,
    paid_cents: line.paid_cents, now_cents: l.price_cents, owed_cents: verdict.owed_cents,
    clause: { id: clause.id, title: clause.title, text: clause.text, source_url: clause.source_url, checked: clause.checked, requires: clause.requires, ask_via: clause.ask_via, window_note: clause.window_note },
    deadline: verdict.deadline!,
    evidence: { sprite: line.sprite, checkpoint: report.checkpoint ?? null, sha256: report.sha256 ?? "", day: report.evidence_day ?? "", apify_run_id: report.run_id, observed_at: report.observed_at },
  };
  const w = writeWords(base);
  const packet: Packet = { ...base, words: w.words, words_source: w.source };
  const digest = digestOf(packet);
  const now = new Date().toISOString();
  if (existing) {
    db().prepare("UPDATE claims SET amount_cents=?, clause_id=?, deadline=?, digest=?, observation_id=? WHERE id=?").run(verdict.owed_cents, clause.id, verdict.deadline, digest, obsId, claimId);
  } else {
    db().prepare("INSERT INTO claims (id,line_id,amount_cents,clause_id,deadline,digest,observation_id,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(claimId, lineId, verdict.owed_cents, clause.id, verdict.deadline, digest, obsId, now);
  }
  issueApproval(claimId, digest);
  db().prepare("INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(`packet:${claimId}`, JSON.stringify(packet));
  event("claim_prepared", { claim: claimId, owed_cents: verdict.owed_cents, digest });
  return claimId;
}

export function packetOf(claimId: string): Packet | null {
  const r = db().prepare("SELECT v FROM kv WHERE k=?").get(`packet:${claimId}`) as { v: string } | undefined;
  return r ? (JSON.parse(r.v) as Packet) : null;
}

// Teresa's answer. Only a human answer becomes a durable fact.
export function answerAsk(askId: string, answer: "same" | "different" | "in_store", now = new Date()) {
  const a = db().prepare("SELECT * FROM asks WHERE id=?").get(askId) as any;
  if (!a) throw new Error("unknown question");
  if (a.answered_at) throw new Error("already answered");
  db().prepare("UPDATE asks SET answered_at=?, answer=? WHERE id=?").run(now.toISOString(), answer, askId);
  const statement = answer === "same" ? "Teresa confirmed the listing is the same item." : answer === "different" ? "Teresa said the listing is a different item." : "Teresa said she bought it in store.";
  db().prepare("INSERT INTO facts_human (id,line_id,statement,at) VALUES (?,?,?,?)").run("f-" + randomUUID().slice(0, 8), a.line_id, statement, now.toISOString());
  if (answer === "same") {
    db().prepare("UPDATE lines SET confirmed_by_human=1 WHERE id=?").run(a.line_id);
    // An answer to "is this your item?" fixes the listing the Sprite will watch.
    const cand = db().prepare("SELECT v FROM kv WHERE k=?").get(`cand:${a.line_id}`) as { v: string } | undefined;
    if (cand) {
      const top = JSON.parse(cand.v)[0];
      db().prepare("UPDATE lines SET listing_url=? WHERE id=? AND (listing_url IS NULL OR listing_url='')").run(top?.url ?? null, a.line_id);
    }
  }
  if (answer === "in_store") db().prepare("UPDATE receipts SET channel='store' WHERE id=(SELECT receipt_id FROM lines WHERE id=?)").run(a.line_id);
  if (answer === "different") db().prepare("UPDATE receipts SET status='watching' WHERE id=(SELECT receipt_id FROM lines WHERE id=?)").run(a.line_id);
  event("human_fact", { ask: askId, answer });
  return a.line_id as string;
}

export function headline() {
  const q = (s: string) => db().prepare(s).get() as any;
  const owed = q("SELECT COALESCE(SUM(amount_cents),0) s, COUNT(*) c FROM claims");
  return {
    receipts: q("SELECT COUNT(*) c FROM receipts").c,
    observations: q("SELECT COUNT(*) c FROM observations").c,
    claims: owed.c,
    owed_cents: owed.s,
    approved: q("SELECT COUNT(*) c FROM claims WHERE approved_at IS NOT NULL").c,
    asks_open: q("SELECT COUNT(*) c FROM asks WHERE answered_at IS NULL").c,
  };
}

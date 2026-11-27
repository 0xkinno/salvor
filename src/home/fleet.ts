// Birth, wake and death of receipt Sprites. Every receipt gets its own computer. It is born with
// the permissions it will ever have (a label, an egress lock), sleeps for free, wakes when
// something knocks, and is deleted when the right to a refund expires.
import { readFileSync, existsSync } from "node:fs";
import * as sprites from "../connectors/sprites.ts";
import { db, event } from "./db.ts";
import { bookCost } from "./cost.ts";
import { ingestReport, watching, setSprite, lineRow } from "./ledger.ts";
import { applicableClauses } from "../policy/engine.ts";
import { notifyAsk, notifyClaimReady } from "./deliver.ts";
import type { Job, Report } from "../receipt/observe.ts";

export const WORKER_PATH = "/home/sprite/salvor/receipt-worker.mjs";
export const EYES_LABEL = "salvor-eyes";
export const POOL = 3;

export const spriteNameFor = (receiptId: string) => `slv-r-${receiptId.toLowerCase()}`;

export function workerBundle(): string {
  const p = process.env.SALVOR_WORKER_BUNDLE ?? "dist/receipt-worker.mjs";
  if (!existsSync(p)) throw new Error(`worker bundle missing at ${p}; run npm run build:worker`);
  return readFileSync(p, "utf8");
}

export type Birth = { name: string; labels: { ok: boolean; route: string; labels: string[] }; egress: string; newborn: string | null; ms: number };

// The egress lock: a receipt Sprite resolves api.sprites.dev (the gateway) and nothing else.
export const EYES_EGRESS = [{ domain: "api.sprites.dev", action: "allow" }];

export async function birth(receiptId: string, lineId: string): Promise<Birth> {
  const t0 = Date.now();
  const line = lineRow(lineId);
  const name = spriteNameFor(receiptId);
  const open = applicableClauses({ paid_cents: line.paid_cents, qty: line.qty, purchased_date: line.purchased_at, retailer: line.retailer })
    .sort((a, b) => b.ends.getTime() - a.ends.getTime())[0];
  if (!open) throw new Error("no verified clause covers this receipt, so no Sprite is born for it");
  await sprites.create(name);
  const labels = await sprites.setLabels(name, [EYES_LABEL]);
  // The clause text Jev sees comes from the policy file, never from a page.
  const job: Job = {
    id: lineId, sprite: name, listing_url: line.listing_url ?? "", retailer: line.retailer,
    line: { raw_text: line.raw_text, paid_cents: line.paid_cents, qty: line.qty },
    clause: { id: open.clause.id, text: open.clause.text },
  };
  await sprites.writeFile(name, WORKER_PATH, workerBundle(), "0755");
  await sprites.writeFile(name, "/home/sprite/salvor/job.json", JSON.stringify(job), "0600");
  await sprites.setNetworkPolicy(name, EYES_EGRESS);
  const cp = await sprites.checkpoint(name, "newborn");
  setSprite(receiptId, name, "watching");
  event("sprite_born", { sprite: name, labels: labels.labels, label_route: labels.route, newborn: cp.id });
  return { name, labels, egress: JSON.stringify(EYES_EGRESS), newborn: cp.id, ms: Date.now() - t0 };
}

export async function writeJob(name: string, job: Job) {
  await sprites.writeFile(name, "/home/sprite/salvor/job.json", JSON.stringify(job), "0600");
}

export type Wake = { sprite: string; ok: boolean; cold_ms: number; report: Report | null; error?: string };

// Wake: the exec call itself wakes the Sprite. Idempotent by run id: a Sprite that already
// reported for this run returns its stored report from disk.
export async function wake(name: string, runId: string, datasetId: string, observedAt: string): Promise<Wake> {
  const t0 = Date.now();
  const seen = db().prepare("SELECT ok FROM wakes WHERE run_id=? AND sprite=?").get(runId, name) as { ok: number | null } | undefined;
  if (!seen) db().prepare("INSERT INTO wakes (run_id,sprite,source,started_at) VALUES (?,?,?,?)").run(runId, name, "apify-webhook", new Date().toISOString());
  try {
    const r = await sprites.exec(name, ["node", WORKER_PATH, "observe", runId, datasetId, observedAt]);
    const ms = Date.now() - t0;
    let report: Report;
    try { report = JSON.parse(r.stdout.trim().split("\n").pop() ?? ""); } catch { throw new Error(`worker printed no report (exit ${r.code}): ${(r.stderr || r.stdout).slice(0, 200)}`); }
    if ((report as any).error) throw new Error((report as any).error);
    db().prepare("UPDATE wakes SET finished_at=?, ok=1, cold_ms=?, cpu_ms=?, wall_ms=?, rss_mb=? WHERE run_id=? AND sprite=?").run(new Date().toISOString(), ms, report.usage?.cpu_ms ?? null, report.usage?.wall_ms ?? null, report.usage?.rss_mb ?? null, runId, name);
    const at = new Date().toISOString();
    for (const c of report.calls ?? []) db().prepare("INSERT INTO sponsor_calls VALUES (?,?,?,?,?,?)").run(c.provider, c.route, c.status, c.ms, name, at);
    return { sprite: name, ok: true, cold_ms: ms, report };
  } catch (e) {
    db().prepare("UPDATE wakes SET finished_at=?, ok=0 WHERE run_id=? AND sprite=?").run(new Date().toISOString(), runId, name);
    event("wake_failed", { sprite: name, run: runId, error: String((e as Error).message).slice(0, 200) });
    return { sprite: name, ok: false, cold_ms: Date.now() - t0, report: null, error: String((e as Error).message) };
  }
}

export async function mapPool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

// One Apify run knocks every watching receipt Sprite, three at a time.
export async function wakeAll(runId: string, datasetId: string, observedAt: string, opts: { now?: Date } = {}) {
  const targets = watching();
  const results = await mapPool(targets, POOL, async (t) => {
    const w = await wake(t.sprite, runId, datasetId, observedAt);
    if (w.ok && w.report) {
      const ing = await ingestReport(t.line_id, w.report, { now: opts.now });
      if (ing.claim_id) void notifyClaimReady(ing.claim_id);
      if (ing.ask_id) void notifyAsk(ing.ask_id);
      return { sprite: t.sprite, ok: true, decision: ing.decision, claim: ing.claim_id };
    }
    return { sprite: t.sprite, ok: false, error: w.error };
  });
  event("wake_all", { run: runId, sprites: targets.length, ok: results.filter((r) => r.ok).length });
  return results;
}

// Death: read the meter first, then delete. The usage API keeps usage for deleted Sprites, so the
// cost of this receipt stays readable afterwards.
export async function retire(name: string, createdAtIso: string) {
  const retiredAt = new Date().toISOString();
  const days = Math.max(0.01, (Date.now() - new Date(createdAtIso).getTime()) / 86_400_000);
  let storageGb: number | null = null;
  try {
    const df = await sprites.exec(name, ["sh", "-c", "df -B1 --output=used / | tail -1"]);
    const used = Number(df.stdout.trim());
    if (Number.isFinite(used) && used > 0) storageGb = used / 1024 ** 3;
  } catch { /* storage stays unmeasured and is shown as such */ }
  // Keep the evidence files before the computer goes: the claim page can still show them and a person can still
  // check their hash against the claim, even though the Sprite's checkpoint copy is gone with it.
  const kept: string[] = [];
  for (const o of db().prepare("SELECT DISTINCT evidence_day d, evidence_sha256 h FROM observations o JOIN lines l ON l.id=o.line_id JOIN receipts r ON r.id=l.receipt_id WHERE r.sprite=? AND o.evidence_sha256 IS NOT NULL").all(name) as { d: string; h: string }[]) {
    try { const b = await sprites.readFile(name, `/home/sprite/salvor/evidence/${o.d}.json`); db().prepare("INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)").run(`evidence:${o.h}`, new TextDecoder().decode(b)); kept.push(o.h); } catch { /* not readable: the claim says so */ }
  }
  const u = await sprites.usage(name, createdAtIso);      // the meter is read BEFORE deleting: deleted Sprites return 404
  const priced = bookCost(name, u, storageGb, days, { born_at: createdAtIso, retired_at: retiredAt });
  await sprites.remove(name);
  db().prepare("UPDATE receipts SET status='retired' WHERE sprite=?").run(name);
  event("sprite_retired", { sprite: name, source: priced.source, total_usd: priced.total_usd, kept_evidence: kept.length });
  return { usage: u, priced, storageGb, kept };
}

// The cap on Sprites without a card is 3 in total (FINDINGS Q8): home, the try-it pool and the receipts share it.
export const SPRITE_CAP = Number(process.env.SALVOR_SPRITE_CAP ?? 3);

// The lifecycle: a receipt whose claim is approved is settled, so its computer is retired (meter read, cost booked,
// evidence kept, Sprite deleted). The freed slot goes to the next receipt waiting for a computer.
export async function advanceLifecycle(taskId?: string) {
  const out = { retired: [] as string[], born: [] as string[], waiting: 0, errors: [] as string[] };
  const settled = db().prepare(`SELECT DISTINCT r.id, r.sprite, r.created_at FROM receipts r JOIN lines l ON l.receipt_id=r.id JOIN claims c ON c.line_id=l.id
    WHERE r.sprite IS NOT NULL AND r.status!='retired' AND c.approved_at IS NOT NULL`).all() as { id: string; sprite: string; created_at: string }[];
  for (const r of settled) { try { await retire(r.sprite, r.created_at); out.retired.push(r.sprite); } catch (e) { out.errors.push(`${r.sprite}: ${(e as Error).message.slice(0, 100)}`); } }
  const live = (await sprites.list("slv-")).length;
  let free = SPRITE_CAP - live;
  const waiting = db().prepare(`SELECT r.id, l.id AS line_id FROM receipts r JOIN lines l ON l.receipt_id=r.id WHERE r.sprite IS NULL AND r.status IN ('new') AND l.listing_url IS NOT NULL AND l.listing_url != '' ORDER BY r.created_at`).all() as { id: string; line_id: string }[];
  for (const w of waiting) {
    if (free <= 0) { out.waiting++; continue; }
    try { const b = await birth(w.id, w.line_id); out.born.push(b.name); free--; } catch (e) { out.errors.push(`${w.id}: ${(e as Error).message.slice(0, 100)}`); out.waiting++; }
  }
  if (out.born.length && taskId) { try { await wakeLatestAll(taskId); } catch (e) { out.errors.push(`first reading: ${(e as Error).message.slice(0, 100)}`); } }
  event("lifecycle", out);
  return out;
}

// Backup knock: each watching Sprite finds the newest successful scheduled run itself.
export async function wakeLatestAll(taskId: string, opts: { now?: Date } = {}) {
  const targets = watching();
  const results = await mapPool(targets, POOL, async (t) => {
    const t0 = Date.now();
    try {
      const r = await sprites.exec(t.sprite, ["node", WORKER_PATH, "observe-latest", taskId]);
      const report: Report = JSON.parse(r.stdout.trim().split("\n").pop() ?? "");
      if ((report as any).error) throw new Error((report as any).error);
      const seen = db().prepare("SELECT 1 x FROM wakes WHERE run_id=? AND sprite=?").get(report.run_id, t.sprite);
      if (seen) return { sprite: t.sprite, ok: true, duplicate: true };
      db().prepare("INSERT INTO wakes (run_id,sprite,source,started_at,finished_at,ok,cold_ms) VALUES (?,?,?,?,?,1,?)").run(report.run_id, t.sprite, "backup-tick", new Date(t0).toISOString(), new Date().toISOString(), Date.now() - t0);
      for (const c of report.calls ?? []) db().prepare("INSERT INTO sponsor_calls VALUES (?,?,?,?,?,?)").run(c.provider, c.route, c.status, c.ms, t.sprite, new Date().toISOString());
      const ing = await ingestReport(t.line_id, report, { now: opts.now });
      if (ing.claim_id) void notifyClaimReady(ing.claim_id);
      if (ing.ask_id) void notifyAsk(ing.ask_id);
      return { sprite: t.sprite, ok: true, decision: ing.decision, claim: ing.claim_id };
    } catch (e) {
      event("tick_failed", { sprite: t.sprite, error: String((e as Error).message).slice(0, 200) });
      return { sprite: t.sprite, ok: false, error: String((e as Error).message) };
    }
  });
  event("tick", { sprites: targets.length, ok: results.filter((r) => r.ok).length });
  return results;
}

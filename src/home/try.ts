// P6: a judge pastes a product URL, the price they paid and the date. A pooled Sprite
// (slv-r-try-1..3), restored to its "newborn" checkpoint, takes one live reading and Salvor decides.
// Nothing about the visitor is kept: the pool Sprite is restored to newborn after use. Capped.
import { createHash } from "node:crypto";
import * as sprites from "../connectors/sprites.ts";
import { db, event, kvGet, kvSet } from "./db.ts";
import { WORKER_PATH, workerBundle, EYES_EGRESS, EYES_LABEL } from "./fleet.ts";
import { evaluate } from "../policy/engine.ts";
import { gate } from "../policy/gate.ts";
import { fmt } from "../policy/money.ts";
import type { Report } from "../receipt/observe.ts";

// The "newborn" checkpoint id is read from the platform when the pool is made (Fly takes an automatic v1 at
// creation, so newborn is usually v2). It is kept in the ledger so a restart does not lose it.
const newbornCache = new Map<string, string>();
export function newbornId(name: string): string | null { return newbornCache.get(name) ?? kvGet(`newborn:${name}`) ?? null; }
// The checkpoint to restore to: the one recorded when the pool was made, else the platform's own list, found by its comment.
async function resolveNewborn(name: string): Promise<string> {
  const known = newbornId(name); if (known) return known;
  const cps = await sprites.listCheckpoints(name);
  const hit = cps.find((c: any) => c.comment === "newborn");
  if (!hit) throw new Error("no checkpoint named newborn on this Sprite");
  newbornCache.set(name, hit.id); kvSet(`newborn:${name}`, hit.id);
  return hit.id;
}

// The no-card Fly trial allows 3 Sprites in total, so the pool size is a setting (SALVOR_POOL, default 3).
export const POOL_NAMES = ["slv-r-try-1", "slv-r-try-2", "slv-r-try-3"].slice(0, Math.max(1, Number(process.env.SALVOR_POOL ?? 3)));
export const CAPS = { per_hour_total: 3, per_visitor_per_hour: 1 };
const busy = new Set<string>();

const hourKey = () => new Date().toISOString().slice(0, 13);

export function visitorKey(ip: string, ua: string) {
  return createHash("sha256").update(ip + "|" + ua).digest("hex").slice(0, 16);
}

export function capsState(visitor: string) {
  const h = hourKey();
  const total = (db().prepare("SELECT COUNT(*) c FROM kv WHERE k LIKE ?").get(`try:${h}:%`) as { c: number }).c;
  const mine = db().prepare("SELECT 1 x FROM kv WHERE k=?").get(`try:${h}:${visitor}`);
  return { total, mine: Boolean(mine), ...CAPS, resets_at: new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000).toISOString() };
}

export const ALLOWED_HOST = /^https:\/\/(www\.)?(target|bestbuy)\.com\//i;

export type TryInput = { url: string; paid: string; date: string };
export type TryResult =
  | { ok: false; error: string; status: number }
  | { ok: true; sprite: string; seconds: number; steps: string[]; decision: string; why: string; owed_cents: number; paid_cents: number; now_cents: number | null; title: string | null; deadline: string | null; checkpoint: string | null; sha256: string | null; read: unknown };

export async function runTry(input: TryInput, visitor: string, paidCents: number): Promise<TryResult> {
  if (!ALLOWED_HOST.test(input.url)) return { ok: false, status: 400, error: "Paste a product link from target.com or bestbuy.com." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, status: 400, error: "Use the date format YYYY-MM-DD." };
  const caps = capsState(visitor);
  if (caps.mine) return { ok: false, status: 429, error: `One live reading per visitor per hour. The cap resets at ${caps.resets_at}.` };
  if (caps.total >= CAPS.per_hour_total) return { ok: false, status: 429, error: `The pool is busy: ${CAPS.per_hour_total} live readings per hour in total. It resets at ${caps.resets_at}.` };
  const name = POOL_NAMES.find((n) => !busy.has(n));
  if (!name) return { ok: false, status: 429, error: "All three pool Sprites are working. Try again in a minute." };
  busy.add(name);
  db().prepare("INSERT OR IGNORE INTO kv (k,v) VALUES (?,?)").run(`try:${hourKey()}:${visitor}`, new Date().toISOString());
  const t0 = Date.now();
  const steps: string[] = [];
  try {
    steps.push(`Woke ${name} from sleep`);
    const retailer = /bestbuy/i.test(input.url) ? "bestbuy" : "target";
    await sprites.exec(name, ["true"]);                                  // the exec wakes the Sprite
    await sprites.writeFile(name, WORKER_PATH, workerBundle(), "0755");
    steps.push("Checked its egress lock and label");
    await sprites.setNetworkPolicy(name, EYES_EGRESS);
    steps.push("Apify is reading the page in Apify's cloud, not on the Sprite");
    const r = await sprites.exec(name, ["node", WORKER_PATH, "try", input.url, String(paidCents), input.date, retailer]);
    const report: Report = JSON.parse(r.stdout.trim().split("\n").pop() ?? "");
    if ((report as any).error) throw new Error((report as any).error);
    const at = new Date();
    for (const c of report.calls ?? []) db().prepare("INSERT INTO sponsor_calls VALUES (?,?,?,?,?,?)").run(c.provider, c.route, c.status, c.ms, name, at.toISOString());
    if (report.decision !== "observed" || !report.listing) {
      return { ok: true, sprite: name, seconds: (Date.now() - t0) / 1000, steps, decision: report.decision === "stale" ? "stale" : "ask", why: report.reason ?? "The page could not be read.", owed_cents: 0, paid_cents: paidCents, now_cents: null, title: null, deadline: null, checkpoint: null, sha256: null, read: null };
    }
    steps.push("The match step decided whether it is the same item");
    const l = report.listing;
    const verdict = evaluate({ paid_cents: paidCents, qty: 1, purchased_date: input.date, retailer }, { price_cents: l.price_cents, regular_cents: l.regular_cents, seller: l.seller, in_stock: l.in_stock, flags: l.flags, observed_at: report.observed_at }, at);
    const read = report.read && !("error" in report.read) ? { same: report.read.same, sameConf: report.read.sameConf, owedP: report.read.owedP } : null;
    const g = gate(verdict, read, false);
    steps.push(`Salvor's code computed ${fmt(verdict.owed_cents)} from the store's own clause`);
    event("try", { sprite: name, decision: g.decision, ms: Date.now() - t0 });
    return { ok: true, sprite: name, seconds: (Date.now() - t0) / 1000, steps, decision: g.decision, why: g.why, owed_cents: verdict.owed_cents, paid_cents: paidCents, now_cents: l.price_cents, title: l.title, deadline: verdict.deadline, checkpoint: report.checkpoint ?? null, sha256: report.sha256 ?? null, read: report.read ?? null };
  } catch (e) {
    db().prepare("DELETE FROM kv WHERE k=?").run(`try:${hourKey()}:${visitor}`);   // a reading that failed does not use up the visitor's hour
    return { ok: false, status: 502, error: `The live reading failed: ${String((e as Error).message).slice(0, 200)}` };
  } finally {
    // The visitor's data does not stay: restore the pool Sprite to its newborn checkpoint.
    setTimeout(() => {
      resolveNewborn(name).then((id) => sprites.restore(name, id)).catch((e) => event("try_restore_failed", { sprite: name, error: String(e.message).slice(0, 120) })).finally(() => busy.delete(name));
    }, process.env.SALVOR_TRY_RESTORE_MS ? Number(process.env.SALVOR_TRY_RESTORE_MS) : 60_000);
  }
}

// Called once at deploy: create the pool, label it, lock egress, checkpoint "newborn".
export async function ensurePool() {
  const out: { name: string; created: boolean; labels: boolean }[] = [];
  for (const n of POOL_NAMES) {
    let created = false;
    try { await sprites.info(n); } catch { await sprites.create(n); created = true; }
    const l = await sprites.setLabels(n, [EYES_LABEL]);
    await sprites.writeFile(n, WORKER_PATH, workerBundle(), "0755");
    await sprites.setNetworkPolicy(n, EYES_EGRESS);
    const cp = await sprites.checkpoint(n, "newborn");
    if (cp.id) { newbornCache.set(n, cp.id); kvSet(`newborn:${n}`, cp.id); }
    out.push({ name: n, created, labels: l.ok });
  }
  return out;
}

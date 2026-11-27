// slv-home: the app, the API and the ledger. node:http only. Serves web/dist as static files.
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";
import { db, event, kvGet, kvSet } from "./db.ts";
import { discover, gatewayMode, killSwitch, probe, REAL_LIST, setRecorder } from "../gateway.ts";
import { mode as sabotageMode } from "../sabotage.ts";
import * as sprites from "../connectors/sprites.ts";
import { rememberConfirmed } from "./memory.ts";
import { answerAsk, headline, packetOf, lineRow, ingestReport } from "./ledger.ts";
import { consumeApproval, renderHtml, renderPdf, chatScript } from "./claims.ts";
import { sendClaim, sweepNotifications } from "./deliver.ts";
import { verifyEvidence } from "./notary.ts";
import { costSummary, RATES } from "./cost.ts";
import { wakeAll, wakeLatestAll, advanceLifecycle, SPRITE_CAP } from "./fleet.ts";
import { runTry, capsState, visitorKey, CAPS } from "./try.ts";
import { parseCents } from "../policy/money.ts";
import { CLAUSES } from "../policy/clauses.ts";
import { scrubUiCopy } from "../house/style.ts";
import { addReceipt, shortId } from "./ledger.ts";
import { birth, retire, spriteNameFor } from "./fleet.ts";
import { pollMail } from "./intake.ts";
import { syncWatch, lastSummary } from "./watch.ts";

const started = Date.now();
const WEB = process.env.SALVOR_WEB ?? "web/dist";
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".webp": "image/webp",
};

setRecorder((provider, route, status, ms) =>
  db().prepare("INSERT INTO sponsor_calls VALUES (?,?,?,?,?,?)").run(provider, route, status, ms, process.env.SPRITE_NAME ?? "local", new Date().toISOString()));

// ---- small helpers ----------------------------------------------------------------------
const send = (res: http.ServerResponse, code: number, body: unknown, headers: Record<string, string> = {}) => {
  const isStr = typeof body === "string" || body instanceof Uint8Array;
  res.writeHead(code, { "content-type": isStr ? "text/plain; charset=utf-8" : "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers });
  res.end(isStr ? (body as any) : JSON.stringify(body));
};
const readBody = async (req: http.IncomingMessage, max = 200_000): Promise<any> => {
  const chunks: Buffer[] = []; let n = 0;
  for await (const c of req) { n += (c as Buffer).length; if (n > max) throw new Error("body too large"); chunks.push(c as Buffer); }
  const t = Buffer.concat(chunks).toString();
  if (!t) return {};
  try { return JSON.parse(t); } catch { throw new Error("body is not JSON"); }
};
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const householdToken = () => process.env.SALVOR_HOUSEHOLD_TOKEN ?? "";
const hasToken = (req: http.IncomingMessage) => {
  const t = householdToken();
  if (!t) return false;
  const h = String(req.headers["x-household-token"] ?? "") || String(req.headers.authorization ?? "").replace(/^Bearer /i, "");
  return h.length > 0 && same(h, t);
};
// Public lock: writes need the household token. The sample household's approve and answer actions
// are open to the public only when SALVOR_PUBLIC_DEMO=1, with a daily cap, because they only ever
// reach the owner's own test inbox.
const publicDemo = () => process.env.SALVOR_PUBLIC_DEMO === "1";
function demoBudget(kind: string, cap: number): boolean {
  const k = `demo:${new Date().toISOString().slice(0, 10)}:${kind}`;
  const n = Number(kvGet(k) ?? 0);
  if (n >= cap) return false;
  kvSet(k, String(n + 1));
  return true;
}
const ip = (req: http.IncomingMessage) => String(req.headers["fly-client-ip"] ?? req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();

// ---- views --------------------------------------------------------------------------------
function nextWake(): string {
  const now = new Date(); const h = now.getUTCHours();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), (Math.floor(h / 6) + 1) * 6, 0, 0));
  return next.toISOString();
}

function receiptsView() {
  const rows = db().prepare(
    `SELECT r.*, l.id AS line_id, l.raw_text, l.paid_cents, l.qty, l.listing_url, l.confirmed_by_human FROM receipts r JOIN lines l ON l.receipt_id=r.id ORDER BY r.created_at DESC`,
  ).all() as any[];
  return rows.map((r) => {
    const o = db().prepare("SELECT * FROM observations WHERE line_id=? ORDER BY observed_at DESC, rowid DESC LIMIT 1").get(r.line_id) as any;
    const c = db().prepare("SELECT id, amount_cents, approved_at, deadline FROM claims WHERE line_id=? ORDER BY created_at DESC LIMIT 1").get(r.line_id) as any;
    const a = db().prepare("SELECT id, question FROM asks WHERE line_id=? AND answered_at IS NULL").get(r.line_id) as any;
    const wake = db().prepare("SELECT started_at FROM wakes WHERE sprite=? ORDER BY started_at DESC LIMIT 1").get(r.sprite ?? "") as any;
    const daysLeft = Math.max(0, (new Date(r.window_ends_at).getTime() - Date.now()) / 86_400_000);
    const cost = db().prepare("SELECT total_usd, source FROM costs WHERE sprite=?").get(r.sprite ?? "") as any;
    const life = r.status === "retired"
      ? { label: "Retired", reason: "The claim was settled, so this receipt's computer was deleted after its meter was read.", cost_usd: cost?.total_usd ?? null, source: cost?.source ?? null }
      : !r.sprite ? { label: "Waiting for a computer", reason: `A free Fly account without a card holds ${SPRITE_CAP} Sprites in total. This receipt gets one when a slot frees.` }
      : c?.approved_at ? { label: "Claimed", reason: "The claim was approved and sent. The computer is retired next." }
      : a ? { label: "Asking you", reason: "One question is waiting for your answer." }
      : c ? { label: "Owed", reason: "A claim is ready for your approval." }
      : !o ? { label: "Born", reason: "This receipt's Sprite exists and has not taken a reading yet." }
      : { label: "Asleep", reason: "Asleep until the next scheduled reading." };
    return {
      life,
      id: r.id, line_id: r.line_id, retailer: r.retailer, title: r.title, raw_text: r.raw_text, purchased_at: r.purchased_at, paid_cents: r.paid_cents, qty: r.qty,
      status: a ? "asking" : c && !c.approved_at ? "owed" : c?.approved_at ? "claimed" : r.status, sprite: r.sprite, window_ends_at: r.window_ends_at, days_left: Math.round(daysLeft * 10) / 10,
      household: r.household, source: r.source, listing_url: r.listing_url,
      last: o ? { observed_at: o.observed_at, price_cents: o.price_cents, decision: o.decision, owed_cents: o.owed_cents } : null,
      claim: c ?? null, ask: a ?? null, last_wake: wake?.started_at ?? null, next_wake: r.sprite && r.status !== "retired" ? nextWake() : null,
    };
  });
}

function receiptDetail(id: string) {
  const base = receiptsView().find((r) => r.id === id);
  if (!base) return null;
  const obs = db().prepare("SELECT * FROM observations WHERE line_id=? ORDER BY observed_at DESC, rowid DESC LIMIT 30").all(base.line_id);
  const claim = db().prepare("SELECT * FROM claims WHERE line_id=? ORDER BY created_at DESC LIMIT 1").get(base.line_id) as any;
  const ask = db().prepare("SELECT * FROM asks WHERE line_id=? ORDER BY asked_at DESC LIMIT 1").get(base.line_id) as any;
  const facts = db().prepare("SELECT statement, at FROM facts_human WHERE line_id=? ORDER BY at").all(base.line_id);
  const clauseId = (obs[0] as any)?.clause_id ?? (base.retailer === "target" ? "target-holiday-2026" : "bestbuy-price-match");
  const c = CLAUSES[clauseId];
  return {
    ...base, observations: obs, facts,
    claim: claim ? { ...claim, packet: packetOf(claim.id), script: chatScript(packetOf(claim.id)!, claim.shared_link) } : null,
    ask: ask ? { ...ask, options: JSON.parse(ask.options) } : null,
    clause: c ? { id: c.id, title: c.title, text: c.text, source_url: c.source_url, checked: c.checked, window_note: c.window_note, verified: c.verified } : null,
    candidates: JSON.parse(kvGet(`cand:${base.line_id}`) ?? "[]"),
  };
}

let fleetCache: { at: number; v: unknown } | null = null;
async function fleetView() {
  if (fleetCache && Date.now() - fleetCache.at < 15_000) return fleetCache.v;
  const out: any[] = [];
  let list: sprites.SpriteInfo[] = [];
  let error: string | null = null;
  try { list = await sprites.list("slv-"); } catch (e) { error = String((e as Error).message).slice(0, 160); }
  await Promise.all(list.map(async (s) => {
    const row: any = { name: s.name, status: s.status, labels: s.labels ?? [], url: s.url ?? null, created_at: s.created_at ?? null };
    try { row.egress = await sprites.getNetworkPolicy(s.name); } catch { row.egress = null; }
    try { row.checkpoints = (await sprites.listCheckpoints(s.name)).slice(-5).map((c: any) => ({ id: c.id ?? c.checkpoint_id, comment: c.comment, created_at: c.created_at })); } catch { row.checkpoints = []; }
    try { const u = await sprites.usage(s.name, new Date(Date.now() - 24 * 3_600_000).toISOString()); row.usage = { cpu_time_sec: u.cpu_time_sec, partial: u.partial }; } catch { row.usage = null; }
    const w = db().prepare("SELECT started_at, cold_ms FROM wakes WHERE sprite=? ORDER BY started_at DESC LIMIT 1").get(s.name) as any;
    row.last_wake = w?.started_at ?? null; row.last_wake_ms = w?.cold_ms ?? null;
    row.wakes = (db().prepare("SELECT substr(started_at,1,13) h, COUNT(*) c FROM wakes WHERE sprite=? GROUP BY h ORDER BY h DESC LIMIT 24").all(s.name) as any[]).reverse();
    out.push(row);
  }));
  const retired = (db().prepare("SELECT sprite, born_at, retired_at, total_usd, source, wakes, cpu_sec FROM costs ORDER BY retired_at DESC").all() as any[]);
  const v = { at: new Date().toISOString(), error, sprites: out.sort((a, b) => a.name.localeCompare(b.name)), retired, cap: SPRITE_CAP, rung: sprites.rung() };
  fleetCache = { at: Date.now(), v };
  return v;
}

let statusCache: { at: number; v: unknown } | null = null;
const HANDS_PROBES: [string, string, string][] = [["mail-hands", "GET", "/v0/auth/me"]];
async function statusView() {
  if (statusCache && Date.now() - statusCache.at < 20_000) return statusCache.v;
  const at = new Date().toISOString();
  let gw: any;
  try {
    const d = await discover(true);
    gw = { ok: true, mode: gatewayMode(), url: d.url === REAL_LIST ? "https://api.sprites.dev/v1/gateway/list" : "local emulator", connections: d.conns.map((c) => ({ name: c.name, provider: c.provider })) };
  } catch (e) { gw = { ok: false, mode: gatewayMode(), error: String((e as Error).message).slice(0, 160), connections: [] }; }
  const handsConns = await Promise.all(HANDS_PROBES.map(([c, m, p]) => (gw.ok ? probe(c, m, p) : Promise.resolve({ conn: c, ok: false, status: 0, ms: 0, at, note: "gateway not reachable" }))));
  const eyes = ["apify-eyes", "pinecone-read"].map((c) => {
    const p = c;
    const r = db().prepare("SELECT status, route, at, ms FROM sponsor_calls WHERE provider=? ORDER BY at DESC LIMIT 1").get(p) as any;
    return { conn: c, via: "last call from a receipt Sprite", ok: r ? r.status >= 200 && r.status < 300 : false, status: r?.status ?? 0, ms: r?.ms ?? 0, at: r?.at ?? null, note: r ? `${r.route}` : "no call yet" };
  });
  const totals = db().prepare("SELECT provider, COUNT(*) calls, SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) ok FROM sponsor_calls WHERE provider IN ('apify-eyes','pinecone-read','pinecone-write','mail-hands') GROUP BY provider ORDER BY provider").all();
  const v = {
    at, uptime_s: Math.round((Date.now() - started) / 1000), gateway: gw, hands: handsConns, eyes,
    sprites: { rung: sprites.rung(), credential_on_box: sprites.credentialOnBox(), note: sprites.credentialOnBox() ? "rung b: one scoped Sprites token is kept in a 0600 file on slv-home only" : "rung a: no key on any Sprite; the Sprites API is reached through a connector" },
    sabotage: sabotageMode(), kill_switch: killSwitch(), public_demo: publicDemo(), sponsor_calls: totals,
    labels: {
      substitutes: [
        ...(gw.mode === "local-emulator" ? [{ what: "all partner and Sprites calls", why: "running against the local test emulator, not the platform" }] : []),
        ...(sprites.credentialOnBox() ? [{ what: "Sprites API access", why: "the connector route was not available, so a scoped token is held on slv-home" }] : []),
        ...(!CLAUSES["bestbuy-price-match"].verified ? [{ what: "Best Buy claims", why: "the policy page was not verified, so Salvor holds those claims instead of estimating" }] : []),
      ],
    },
  };
  statusCache = { at: Date.now(), v };
  return v;
}

function proofView() {
  const facts = existsSync("docs/FACTS.json") ? JSON.parse(readFileSync("docs/FACTS.json", "utf8")) : null;
  const calls = db().prepare("SELECT provider, COUNT(*) calls, SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) ok, MIN(at) since FROM sponsor_calls WHERE provider IN ('apify-eyes','pinecone-read','pinecone-write','mail-hands') GROUP BY provider ORDER BY provider").all();
  const keys = Object.keys(process.env).filter((k) => /api[_-]?key|token|secret|password/i.test(k) && !/^SALVOR_(HOUSEHOLD|HOOK|TICK)/.test(k));
  let policy: unknown = null;
  try { policy = JSON.parse(readFileSync("/.sprite/policy/network.json", "utf8")); } catch { policy = null; }
  return {
    facts, sponsor_calls: calls, cost: costSummary(),
    zero_keys: { secret_like_env_names: keys, sprites_rung: sprites.rung(), credential_on_box: sprites.credentialOnBox(), note: "Only the household token and webhook secrets are held here; they guard Salvor's own routes and open no partner account." },
    network_policy_readonly: policy, budget: { try_caps: CAPS }, rates: RATES,
    events: (db().prepare("SELECT COUNT(*) c FROM events").get() as any).c,
    events_tail: (db().prepare("SELECT kind, substr(body,1,160) body, at FROM events ORDER BY id DESC LIMIT 12").all() as any[]),
  };
}

function runFiles() {
  const dir = "evidence/runs";
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")) : [];
}

// ---- router -------------------------------------------------------------------------------
async function route(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  const p = url.pathname;
  const m = req.method ?? "GET";

  if (p === "/health") return send(res, 200, { ok: true, uptime_s: Math.round((Date.now() - started) / 1000) });
  if (p === "/api/status") return send(res, 200, await statusView());
  if (p === "/api/stats") {
    const lastWake = db().prepare("SELECT MAX(started_at) t FROM wakes").get() as { t: string | null };
    const hooks = db().prepare("SELECT COUNT(*) c, MAX(at) t FROM events WHERE kind='hook'").get() as { c: number; t: string | null };
    return send(res, 200, { ...headline(), cost: { per_receipt_usd: costSummary().per_receipt_usd }, watch: lastSummary(), webhook: { received: hooks.c, last_at: hooks.t }, last_wake_at: lastWake.t, recomputed_at: new Date().toISOString() });
  }
  if (p === "/api/receipts" && m === "GET") return send(res, 200, { receipts: receiptsView(), next_wake: nextWake(), headline: headline() });
  const rm = /^\/api\/receipts\/([A-Za-z0-9-]+)$/.exec(p);
  if (rm && m === "GET") { const d = receiptDetail(rm[1]); return d ? send(res, 200, d) : send(res, 404, { error: "unknown receipt" }); }
  if (p === "/api/fleet") return send(res, 200, await fleetView());
  if (p === "/api/proof") return send(res, 200, proofView());
  if (p === "/api/facts") return existsSync("docs/FACTS.json") ? send(res, 200, JSON.parse(readFileSync("docs/FACTS.json", "utf8"))) : send(res, 200, { empty: true });
  if (p === "/api/runs") return send(res, 200, { files: runFiles() });
  if (p === "/api/try/caps") return send(res, 200, capsState(visitorKey(ip(req), String(req.headers["user-agent"] ?? ""))));

  const cm = /^\/api\/claims\/(c-[a-z0-9]+)$/.exec(p);
  if (cm && m === "GET") {
    const c = db().prepare("SELECT * FROM claims WHERE id=?").get(cm[1]) as any;
    const pk = packetOf(cm[1]);
    return c && pk ? send(res, 200, { claim: c, packet: pk, script: chatScript(pk, c.shared_link) }) : send(res, 404, { error: "unknown claim" });
  }
  const printable = /^\/claims\/(c-[a-z0-9]+)(\.pdf)?$/.exec(p);
  if (printable) {
    const c = db().prepare("SELECT * FROM claims WHERE id=?").get(printable[1]) as any;
    const pk = packetOf(printable[1]);
    if (!c || !pk) return send(res, 404, "unknown claim");
    if (printable[2]) return send(res, 200, renderPdf(pk, c.shared_link, c.digest), { "content-type": "application/pdf" });
    return send(res, 200, renderHtml(pk, c.shared_link, c.digest), { "content-type": "text/html; charset=utf-8" });
  }

  // ---- writes
  const am = /^\/api\/claims\/(c-[a-z0-9]+)\/approve$/.exec(p);
  if (am && m === "POST") {
    const c = db().prepare("SELECT l.id lid, r.household FROM claims c JOIN lines l ON l.id=c.line_id JOIN receipts r ON r.id=l.receipt_id WHERE c.id=?").get(am[1]) as any;
    if (!c) return send(res, 404, { error: "unknown claim" });
    const allowed = hasToken(req) || (publicDemo() && c.household === "sample" && demoBudget("approve", 6));
    if (!allowed) return send(res, 403, { error: publicDemo() ? "The daily limit for public approvals is used up. The owner can approve with the household token." : "Approving needs the household token." });
    const b = await readBody(req);
    const r = consumeApproval(am[1], String(b.digest ?? ""));
    if (!r.ok) return send(res, 409, { error: r.why });
    const sent = await sendClaim(am[1]);
    advanceLifecycle(process.env.SALVOR_APIFY_TASK).catch((e) => event("lifecycle_failed", { error: String(e.message).slice(0, 200) }));
    return send(res, 200, { approved: true, sent });
  }
  const askm = /^\/api\/asks\/(a-[a-z0-9]+)\/answer$/.exec(p);
  if (askm && m === "POST") {
    const a = db().prepare("SELECT a.*, r.household FROM asks a JOIN lines l ON l.id=a.line_id JOIN receipts r ON r.id=l.receipt_id WHERE a.id=?").get(askm[1]) as any;
    if (!a) return send(res, 404, { error: "unknown question" });
    const allowed = hasToken(req) || (publicDemo() && a.household === "sample" && demoBudget("answer", 20));
    if (!allowed) return send(res, 403, { error: "Answering needs the household token." });
    const b = await readBody(req);
    if (!["same", "different", "in_store"].includes(b.answer)) return send(res, 400, { error: "answer must be same, different or in_store" });
    try { const lineId = answerAsk(askm[1], b.answer); if (b.answer === "same") void rememberConfirmed(lineId); return send(res, 200, { ok: true, line_id: lineId }); } catch (e) { return send(res, 409, { error: (e as Error).message }); }
  }
  const vm = /^\/api\/verify\/(o-[a-z0-9]+)$/.exec(p);
  if (vm && m === "POST") {
    const o = db().prepare("SELECT o.*, r.sprite FROM observations o JOIN lines l ON l.id=o.line_id JOIN receipts r ON r.id=l.receipt_id WHERE o.id=?").get(vm[1]) as any;
    if (!o || !o.checkpoint_id) return send(res, 404, { error: "no checkpointed evidence for this observation" });
    const gone = db().prepare("SELECT status FROM receipts r JOIN lines l ON l.receipt_id=r.id WHERE l.id=?").get(o.line_id) as any;
    if (gone?.status === "retired") {
      // The Sprite is deleted, so Fly's checkpoint copy went with it. The evidence file was kept when it retired.
      const kept = kvGet(`evidence:${o.evidence_sha256}`);
      const h = kept === null ? null : createHash("sha256").update(kept).digest("hex");
      return send(res, 200, { ok: h === o.evidence_sha256, method: "kept copy", checkpoint: o.checkpoint_id, day: o.evidence_day, expected_sha256: o.evidence_sha256, mount_sha256: h, live_sha256: null, live_matches_mount: null, witness: { found: false, comment_has_hash: false, created_at: null }, why: kept === null ? "This receipt's Sprite was retired and no copy of the evidence was kept." : h === o.evidence_sha256 ? "This receipt's Sprite was retired. The evidence file kept at retirement matches the hash on the claim." : "The kept evidence file does NOT match the hash on the claim.", ms: 0 });
    }
    if (!demoBudget("verify", 200)) return send(res, 429, { error: "verification limit reached for today" });
    try { return send(res, 200, await verifyEvidence(o.sprite, o.checkpoint_id, o.evidence_day, o.evidence_sha256)); }
    catch (e) { return send(res, 502, { error: String((e as Error).message).slice(0, 200) }); }
  }
  if (p === "/api/try" && m === "POST") {
    const b = await readBody(req);
    let cents: number;
    try { cents = parseCents(String(b.paid ?? "")); } catch { return send(res, 400, { error: "Enter the price you paid, like 129.99." }); }
    const r = await runTry({ url: String(b.url ?? ""), paid: String(b.paid ?? ""), date: String(b.date ?? "") }, visitorKey(ip(req), String(req.headers["user-agent"] ?? "")), cents);
    return send(res, r.ok ? 200 : r.status, r);
  }
  if (p === "/api/receipts" && m === "POST") {
    if (!hasToken(req)) return send(res, 403, { error: "Adding a receipt needs the household token." });
    const b = await readBody(req);
    let cents: number;
    try { cents = parseCents(String(b.paid ?? "")); } catch { return send(res, 400, { error: "paid must be a price like 129.99" }); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date ?? "")) || !["target", "bestbuy"].includes(b.retailer) || !String(b.line ?? "").trim()) return send(res, 400, { error: "retailer, date (YYYY-MM-DD) and line are required" });
    const r = addReceipt({ retailer: b.retailer, channel: "online", purchased_date: b.date, source: "api", household: "owner", lines: [{ raw_text: String(b.line).slice(0, 160), paid_cents: cents, qty: Math.max(1, Number(b.qty) || 1), listing_url: b.url || null }] });
    let born: unknown = null;
    if (b.url) { try { born = await birth(r.receiptId, r.lineIds[0]); } catch (e) { born = { error: String((e as Error).message).slice(0, 200) }; } }
    return send(res, 201, { receipt: r.receiptId, line: r.lineIds[0], sprite: born && typeof born === "object" && "name" in (born as object) ? (born as { name: string }).name : null, born });
  }
  const del = /^\/api\/receipts\/([A-Za-z0-9]{4})$/.exec(p);
  if (del && m === "DELETE") {
    // Owner tool: remove one receipt and its rows, and delete its Sprite if it has one.
    if (!hasToken(req)) return send(res, 403, { error: "Deleting a receipt needs the household token." });
    const r = db().prepare("SELECT id, sprite, status, household FROM receipts WHERE id=?").get(del[1]) as any;
    if (!r) return send(res, 404, { error: "unknown receipt" });
    if (r.household === "sample") return send(res, 409, { error: "sample household receipts are not deleted" });
    if (r.sprite && r.status !== "retired") { try { await sprites.remove(r.sprite); } catch (e) { return send(res, 502, { error: `could not delete ${r.sprite}: ${String((e as Error).message).slice(0, 120)}` }); } }
    for (const l of db().prepare("SELECT id FROM lines WHERE receipt_id=?").all(r.id) as { id: string }[]) {
      for (const c of db().prepare("SELECT id FROM claims WHERE line_id=?").all(l.id) as { id: string }[]) { db().prepare("DELETE FROM approvals WHERE claim_id=?").run(c.id); db().prepare("DELETE FROM kv WHERE k=?").run(`packet:${c.id}`); }
      for (const t of ["claims", "observations", "asks", "facts_human"]) db().prepare(`DELETE FROM ${t} WHERE line_id=?`).run(l.id);
      db().prepare("DELETE FROM kv WHERE k=?").run(`cand:${l.id}`);
    }
    db().prepare("DELETE FROM lines WHERE receipt_id=?").run(r.id); db().prepare("DELETE FROM receipts WHERE id=?").run(r.id);
    event("receipt_deleted", { id: r.id });
    return send(res, 200, { deleted: r.id, sprite_deleted: Boolean(r.sprite && r.status !== "retired") });
  }
  if (p === "/api/lifecycle/advance" && m === "POST") {
    if (!hasToken(req)) return send(res, 403, { error: "Advancing the lifecycle needs the household token." });
    return send(res, 200, await advanceLifecycle(process.env.SALVOR_APIFY_TASK));
  }
  if (p === "/api/watch/sync" && m === "POST") {
    if (!hasToken(req)) return send(res, 403, { error: "Syncing the watch needs the household token." });
    return send(res, 200, await syncWatch());
  }
  if (p === "/api/poll" && m === "POST") {
    if (!hasToken(req)) return send(res, 403, { error: "Polling the inbox needs the household token." });
    const inbox = process.env.SALVOR_INBOX;
    if (!inbox) return send(res, 503, { error: "SALVOR_INBOX is not set" });
    try { const r = await pollMail(inbox); await sweepNotifications(); return send(res, 200, r); } catch (e) { return send(res, 502, { error: String((e as Error).message).slice(0, 200) }); }
  }
  // ---- the two wake sources: Apify's schedule webhook and the backup tick
  const hook = /^\/hooks\/apify\/([A-Za-z0-9_-]+)$/.exec(p);
  if (hook && m === "POST") {
    const secret = process.env.SALVOR_HOOK_SECRET ?? "";
    if (!secret || !same(hook[1], secret)) return send(res, 403, { error: "bad secret" });
    const b = await readBody(req, 1_000_000);
    const runId = String(b.runId ?? b.resource?.id ?? b.eventData?.actorRunId ?? "");
    const datasetId = String(b.datasetId ?? b.resource?.defaultDatasetId ?? "");
    const finished = String(b.finishedAt ?? b.resource?.finishedAt ?? new Date().toISOString());
    const status = String(b.status ?? b.resource?.status ?? "SUCCEEDED");
    if (!runId || !datasetId) return send(res, 400, { error: "payload has no run id or dataset id" });
    if (status !== "SUCCEEDED") { event("hook_ignored", { runId, status }); return send(res, 200, { ignored: status }); }
    if (kvGet(`run:${runId}`)) return send(res, 200, { duplicate: true, runId });
    kvSet(`run:${runId}`, new Date().toISOString());
    event("hook", { runId, datasetId });
    if (killSwitch()) return send(res, 200, { kill_switch: true });
    // Answer fast, work after: Apify only needs a 2xx.
    send(res, 202, { accepted: true, runId });
    wakeAll(runId, datasetId, finished).then(() => syncWatch()).catch((e) => event("wake_all_failed", { runId, error: String(e.message).slice(0, 200) }));
    return;
  }
  if (p === "/tick" && m === "POST") {
    // The backup knock. It needs no secret because it can only do what the schedule already does: each receipt
    // Sprite reads the newest finished run, and a run already seen returns its stored report. It is rate limited
    // to one knock per 20 minutes so it cannot be used to run up cost.
    const task = process.env.SALVOR_APIFY_TASK ?? "";
    if (!task) return send(res, 503, { error: "SALVOR_APIFY_TASK is not set" });
    if (killSwitch()) return send(res, 200, { kill_switch: true });
    const last = Number(kvGet("tick:last") ?? 0);
    if (Date.now() - last < 20 * 60_000) return send(res, 429, { error: "a tick ran less than 20 minutes ago", next_at: new Date(last + 20 * 60_000).toISOString() });
    kvSet("tick:last", String(Date.now()));
    event("tick_received", { from: ip(req) ? "remote" : "unknown" });
    send(res, 202, { accepted: true });
    wakeLatestAll(task).then(() => syncWatch()).catch((e) => event("tick_failed", { error: String(e.message).slice(0, 200) }));
    return;
  }
  if (p.startsWith("/api/") || p.startsWith("/hooks/")) return send(res, 404, { error: "no such route" });

  // ---- static app with SPA fallback
  let file = normalize(join(WEB, p === "/" ? "index.html" : p));
  if (!file.startsWith(normalize(WEB))) return send(res, 400, "bad path");
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(WEB, "index.html");
  if (!existsSync(file)) return send(res, 200, "Salvor is running. The web app has not been built yet (npm run build:web).", { "content-type": "text/plain; charset=utf-8" });
  const body = readFileSync(file);
  const long = /\/assets\/|\/fonts\//.test(file);
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": long ? "public, max-age=31536000, immutable" : "no-cache", "x-content-type-options": "nosniff" });
  res.end(extname(file) === ".html" ? scrubUiCopy(body.toString()) : body);
}

export function createServer() {
  return http.createServer((req, res) => {
    route(req, res).catch((e) => {
      event("server_error", { path: req.url, error: String(e?.message ?? e).slice(0, 200) });
      if (!res.headersSent) send(res, 500, { error: "internal error" }); else res.end();
    });
  });
}

// Background work on slv-home. Intake polling and the retire sweep run on timers; each step is
// wrapped so one failure never stops the loop, and every failure lands in the event log.
export function startBackground() {
  const guard = (name: string, fn: () => Promise<unknown>) => () => { if (killSwitch()) return; fn().catch((e) => event("background_failed", { name, error: String(e?.message ?? e).slice(0, 200) })); };
  const inbox = process.env.SALVOR_INBOX;
  setTimeout(guard("watch", () => syncWatch()), 20_000);
  setInterval(guard("watch", () => syncWatch()), 60 * 60_000);
  if (inbox) setInterval(guard("mail", async () => { await pollMail(inbox); await sweepNotifications(); }), 2 * 60_000);
  // Retire Sprites whose window has closed: read the meter, book the cost, delete.
  setInterval(guard("retire", async () => {
    const due = db().prepare("SELECT id, sprite, created_at FROM receipts WHERE sprite IS NOT NULL AND status NOT IN ('retired') AND window_ends_at < ? AND NOT EXISTS (SELECT 1 FROM claims c JOIN lines l ON l.id=c.line_id WHERE l.receipt_id=receipts.id AND c.approved_at IS NULL)").all(new Date().toISOString()) as any[];
    for (const r of due) await retire(r.sprite, r.created_at);
  }), 60 * 60_000);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.SALVOR_BACKGROUND !== "0") startBackground();
  const port = Number(process.env.PORT ?? 8080);
  createServer().listen(port, "0.0.0.0", () => console.log(`salvor home listening on ${port} (gateway: ${gatewayMode()})`));
}

export { ingestReport, lineRow, createHash, shortId };

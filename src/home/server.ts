// slv-home: the app, the API and the ledger. node:http only. Serves web/dist as static files.
import http from "node:http";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";
import { db, event, kvGet, kvSet } from "./db.ts";
import { discover, gatewayMode, killSwitch, probe, REAL_LIST, setRecorder } from "../gateway.ts";
import { mode as sabotageMode } from "../sabotage.ts";
import * as sprites from "../connectors/sprites.ts";
import { answerAsk, headline, packetOf, lineRow, ingestReport } from "./ledger.ts";
import { consumeApproval, renderHtml, renderPdf, chatScript } from "./claims.ts";
import { sendClaim, fileClaimInBox } from "./deliver.ts";
import { verifyEvidence } from "./notary.ts";
import { costSummary, RATES } from "./cost.ts";
import { wakeAll, wakeLatestAll } from "./fleet.ts";
import { runTry, capsState, visitorKey, CAPS } from "./try.ts";
import { parseCents } from "../policy/money.ts";
import { CLAUSES } from "../policy/clauses.ts";
import { scrubUiCopy } from "../house/style.ts";
import { claimWords } from "../connectors/ollama.ts";

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
    const o = db().prepare("SELECT * FROM observations WHERE line_id=? ORDER BY observed_at DESC LIMIT 1").get(r.line_id) as any;
    const c = db().prepare("SELECT id, amount_cents, approved_at, deadline FROM claims WHERE line_id=? ORDER BY created_at DESC LIMIT 1").get(r.line_id) as any;
    const a = db().prepare("SELECT id, question FROM asks WHERE line_id=? AND answered_at IS NULL").get(r.line_id) as any;
    const wake = db().prepare("SELECT started_at FROM wakes WHERE sprite=? ORDER BY started_at DESC LIMIT 1").get(r.sprite ?? "") as any;
    const daysLeft = Math.max(0, (new Date(r.window_ends_at).getTime() - Date.now()) / 86_400_000);
    return {
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
  const obs = db().prepare("SELECT * FROM observations WHERE line_id=? ORDER BY observed_at DESC LIMIT 30").all(base.line_id);
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
    try { const u = await sprites.usage(s.name, s.created_at ?? new Date(Date.now() - 7 * 86_400_000).toISOString()); row.usage = { cpu_time_sec: u.cpu_time_sec, partial: u.partial }; } catch { row.usage = null; }
    const w = db().prepare("SELECT started_at, cold_ms FROM wakes WHERE sprite=? ORDER BY started_at DESC LIMIT 1").get(s.name) as any;
    row.last_wake = w?.started_at ?? null; row.last_wake_ms = w?.cold_ms ?? null;
    row.wakes = (db().prepare("SELECT substr(started_at,1,13) h, COUNT(*) c FROM wakes WHERE sprite=? GROUP BY h ORDER BY h DESC LIMIT 24").all(s.name) as any[]).reverse();
    out.push(row);
  }));
  const v = { at: new Date().toISOString(), error, sprites: out.sort((a, b) => a.name.localeCompare(b.name)), rung: sprites.rung() };
  fleetCache = { at: Date.now(), v };
  return v;
}

let statusCache: { at: number; v: unknown } | null = null;
const HANDS_PROBES: [string, string, string][] = [
  ["box-hands", "GET", "/2.0/users/me"], ["mail-hands", "GET", "/v0/auth/me"], ["ollama-hands", "GET", "/api/tags"], ["sprites-api-hands", "GET", "/v1/sprites?prefix=slv-home"],
];
async function statusView() {
  if (statusCache && Date.now() - statusCache.at < 20_000) return statusCache.v;
  const at = new Date().toISOString();
  let gw: any;
  try {
    const d = await discover(true);
    gw = { ok: true, mode: gatewayMode(), url: d.url === REAL_LIST ? "https://api.sprites.dev/v1/gateway/list" : "local emulator", connections: d.conns.map((c) => ({ name: c.name, provider: c.provider })) };
  } catch (e) { gw = { ok: false, mode: gatewayMode(), error: String((e as Error).message).slice(0, 160), connections: [] }; }
  const handsConns = await Promise.all(HANDS_PROBES.map(([c, m, p]) => (gw.connections.some((x: any) => x.name === c) ? probe(c, m, p) : Promise.resolve({ conn: c, ok: false, status: 0, ms: 0, at, note: "not granted to slv-home" }))));
  const eyes = ["apify-eyes", "jev-eyes", "pinecone-read"].map((c) => {
    const p = c === "apify-eyes" ? "apify" : c === "jev-eyes" ? "jev-eyes" : "pinecone-read";
    const r = db().prepare("SELECT status, route, at, ms FROM sponsor_calls WHERE provider=? ORDER BY at DESC LIMIT 1").get(p) as any;
    return { conn: c, via: "last call from a receipt Sprite", ok: r ? r.status >= 200 && r.status < 300 : false, status: r?.status ?? 0, ms: r?.ms ?? 0, at: r?.at ?? null, note: r ? `${r.route}` : "no call yet" };
  });
  const totals = db().prepare("SELECT provider, COUNT(*) calls, SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) ok FROM sponsor_calls GROUP BY provider ORDER BY provider").all();
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
  const calls = db().prepare("SELECT provider, COUNT(*) calls, SUM(CASE WHEN status BETWEEN 200 AND 299 THEN 1 ELSE 0 END) ok, MIN(at) since FROM sponsor_calls GROUP BY provider ORDER BY provider").all();
  const keys = Object.keys(process.env).filter((k) => /api[_-]?key|token|secret|password/i.test(k) && !/^SALVOR_(HOUSEHOLD|HOOK|TICK)/.test(k));
  let policy: unknown = null;
  try { policy = JSON.parse(readFileSync("/.sprite/policy/network.json", "utf8")); } catch { policy = null; }
  return {
    facts, sponsor_calls: calls, cost: costSummary(),
    zero_keys: { secret_like_env_names: keys, sprites_rung: sprites.rung(), credential_on_box: sprites.credentialOnBox(), note: "Only the household token and webhook secrets are held here; they guard Salvor's own routes and open no partner account." },
    network_policy_readonly: policy, budget: { try_caps: CAPS }, rates: RATES,
    events: (db().prepare("SELECT COUNT(*) c FROM events").get() as any).c,
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
  if (p === "/api/stats") return send(res, 200, { ...headline(), cost: { per_receipt_usd: costSummary().per_receipt_usd }, recomputed_at: new Date().toISOString() });
  if (p === "/api/receipts") return send(res, 200, { receipts: receiptsView(), next_wake: nextWake(), headline: headline() });
  const rm = /^\/api\/receipts\/([A-Za-z0-9-]+)$/.exec(p);
  if (rm) { const d = receiptDetail(rm[1]); return d ? send(res, 200, d) : send(res, 404, { error: "unknown receipt" }); }
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
    try { const lineId = answerAsk(askm[1], b.answer); return send(res, 200, { ok: true, line_id: lineId }); } catch (e) { return send(res, 409, { error: (e as Error).message }); }
  }
  const vm = /^\/api\/verify\/(o-[a-z0-9]+)$/.exec(p);
  if (vm && m === "POST") {
    const o = db().prepare("SELECT o.*, r.sprite FROM observations o JOIN lines l ON l.id=o.line_id JOIN receipts r ON r.id=l.receipt_id WHERE o.id=?").get(vm[1]) as any;
    if (!o || !o.checkpoint_id) return send(res, 404, { error: "no checkpointed evidence for this observation" });
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
    wakeAll(runId, datasetId, finished).catch((e) => event("wake_all_failed", { runId, error: String(e.message).slice(0, 200) }));
    return;
  }
  if (p === "/tick" && m === "POST") {
    const t = process.env.SALVOR_TICK_SECRET ?? "";
    if (!t || !same(String(req.headers["x-salvor-tick"] ?? ""), t)) return send(res, 403, { error: "bad secret" });
    const task = process.env.SALVOR_APIFY_TASK ?? "";
    if (!task) return send(res, 503, { error: "SALVOR_APIFY_TASK is not set" });
    if (killSwitch()) return send(res, 200, { kill_switch: true });
    send(res, 202, { accepted: true });
    wakeLatestAll(task).catch((e) => event("tick_failed", { error: String(e.message).slice(0, 200) }));
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8080);
  createServer().listen(port, "0.0.0.0", () => console.log(`salvor home listening on ${port} (gateway: ${gatewayMode()})`));
}

export { ingestReport, lineRow, claimWords, fileClaimInBox, createHash };

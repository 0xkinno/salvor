// Local-only helpers for the setup scripts. These run on the owner's machine or the build
// machine with real tokens in the environment. Tokens are read from env, never written to disk,
// and every logged request is redacted.
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";

export const SPRITES = "https://api.sprites.dev";

export function need(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) { console.error(`Missing environment variables: ${missing.join(", ")}`); process.exit(2); }
}

const SECRET = /(authorization|api[-_]?key|token|secret|password)/i;
export function redact(v) {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? "<redacted>" : redact(x)]));
  if (typeof v === "string" && /^(sk|key|pc|ak|am|apify_api|ollama)[-_a-z0-9]{12,}/i.test(v)) return "<redacted>";
  return v;
}

export const logPath = (name) => { mkdirSync("evidence/probe", { recursive: true }); return `evidence/probe/${name}`; };

export async function sp(method, path, body, opts = {}) {
  const token = process.env.SPRITES_TOKEN;
  const headers = { authorization: `Bearer ${token}`, ...(opts.headers ?? {}) };
  let payload;
  if (body !== undefined) {
    if (body instanceof Uint8Array || typeof body === "string") payload = body;
    else { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  }
  const t0 = Date.now();
  const r = await fetch(SPRITES + path, { method, headers, body: payload, signal: AbortSignal.timeout(opts.timeout ?? 120_000) });
  const buf = new Uint8Array(await r.arrayBuffer());
  const text = new TextDecoder().decode(buf);
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, ok: r.ok, ms: Date.now() - t0, text, json, buf, headers: Object.fromEntries(r.headers) };
}

export async function execOn(name, argv, { env = {}, dir, stdin } = {}) {
  const q = new URLSearchParams();
  for (const a of argv) q.append("cmd", a);
  for (const [k, v] of Object.entries(env)) q.append("env", `${k}=${v}`);
  if (dir) q.set("dir", dir);
  if (stdin !== undefined) q.set("stdin", "true");
  const r = await sp("POST", `/v1/sprites/${name}/exec?${q}`, stdin !== undefined ? new TextEncoder().encode(stdin) : undefined, { headers: { "content-type": "application/octet-stream" } });
  return r;
}

// Frames: 0x01 stdout, 0x02 stderr, 0x03 exit. Falls back to plain text. Mirrors src/connectors/sprites.ts.
export function decodeExec(buf, contentType = "") {
  if (contentType.includes("json")) { try { const j = JSON.parse(new TextDecoder().decode(buf)); return { stdout: j.stdout ?? "", stderr: j.stderr ?? "", code: j.exit_code ?? 0, framed: false }; } catch { /* fall through */ } }
  if (!buf.length || ![1, 2, 3].includes(buf[0])) return { stdout: new TextDecoder().decode(buf), stderr: "", code: 0, framed: false };
  const out = [], err = []; let cur = 0, code = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 1 || b === 2 || b === 3) { cur = b; if (b === 3 && buf[i + 1] !== undefined && buf[i + 1] < 128 && !(buf[i + 1] >= 48 && buf[i + 1] <= 57)) { code = buf[i + 1]; i++; } continue; }
    if (cur === 1) out.push(b); else if (cur === 2) err.push(b); else if (cur === 3 && b >= 48 && b <= 57) code = code * 10 + (b - 48);
  }
  return { stdout: new TextDecoder().decode(Uint8Array.from(out)), stderr: new TextDecoder().decode(Uint8Array.from(err)), code, framed: true };
}

export async function run(name, argv, opts) {
  const r = await execOn(name, argv, opts);
  const d = decodeExec(r.buf, r.headers["content-type"] ?? "");
  return { ...d, status: r.status, ms: r.ms, hex: Buffer.from(r.buf.slice(0, 48)).toString("hex") };
}

export function appendLog(file, entry) {
  appendFileSync(file, JSON.stringify(redact({ at: new Date().toISOString(), ...entry })) + "\n");
}
export function writeJson(file, o) { writeFileSync(file, JSON.stringify(redact(o), null, 2)); }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

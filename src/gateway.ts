// One door to the outside world. No Authorization header ever leaves this file.
// On a Sprite the gateway identifies the caller from Fly's request signature; this code holds
// no key. Every call is counted (R7) and every status is measured, never assumed.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export const REAL_LIST = "https://api.sprites.dev/v1/gateway/list";
const LIST = () => process.env.SALVOR_GATEWAY_LIST ?? REAL_LIST;

export type Conn = { provider: string; name: string; base: string };
type Discovery = { at: number; conns: Conn[]; available: unknown[]; url: string };
let cache: Discovery | null = null;

export function gatewayMode(): "sprites-gateway" | "local-emulator" {
  return LIST() === REAL_LIST ? "sprites-gateway" : "local-emulator";
}

export async function discover(force = false): Promise<Discovery> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache;
  if (killSwitch()) throw new Error("kill switch is on: partner calls are stopped");
  const r = await fetch(LIST(), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`gateway list HTTP ${r.status}`);
  const j: any = await r.json();
  const raw: any[] = [...(Array.isArray(j) ? j : []), ...(j.connections ?? j.connected ?? [])];
  const conns = raw
    .filter((c) => c.gateway_base_url)
    .map((c) => ({
      provider: String(c.provider ?? ""),
      name: String(c.display_name ?? c.provider_account_name ?? c.provider ?? ""),
      base: String(c.gateway_base_url).replace(/\/+$/, ""),
    }));
  cache = { at: Date.now(), conns, available: j.available ?? [], url: LIST() };
  return cache;
}

export function resetDiscovery() { cache = null; }

// config/connections.json (written by scripts/setup-connectors.mjs) maps our names to connection ids.
// Ids are not secrets. A connection is found by id first, then by display name, then by provider.
let idMap: Record<string, string> | null = null;
function idFor(name: string): string | null {
  if (idMap === null) {
    idMap = {};
    try {
      const j = JSON.parse(readFileSync(process.env.SALVOR_CONNECTIONS ?? "config/connections.json", "utf8"));
      for (const [k, v] of Object.entries<any>(j.connections ?? {})) if (v?.id) idMap[k] = String(v.id);
    } catch { /* no map: names and providers are used */ }
  }
  return idMap[name] ?? null;
}

// Never fall back silently: a name that matches nothing throws.
export async function base(name: string): Promise<string> {
  const { conns } = await discover();
  const id = idFor(name);
  const hit = (id ? conns.find((c) => c.base.endsWith("/" + id)) : undefined)
    ?? conns.find((c) => c.name.toLowerCase() === name.toLowerCase())
    ?? conns.find((c) => c.provider.toLowerCase() === name.toLowerCase());
  if (!hit) throw new Error(`connector "${name}" is not granted to this Sprite`);
  return hit.base;
}

export function killSwitch(): boolean {
  return process.env.SALVOR_KILL === "1";
}

// Recorder is injected: home writes to SQLite, a receipt Sprite appends to calls.jsonl.
export type Recorder = (provider: string, route: string, status: number, ms: number) => void;
let recorder: Recorder = () => {};
export function setRecorder(r: Recorder) { recorder = r; }

export function fileRecorder(path: string): Recorder {
  mkdirSync(dirname(path), { recursive: true });
  const sprite = process.env.SPRITE_NAME ?? "local";
  return (provider, route, status, ms) =>
    appendFileSync(path, JSON.stringify({ provider, route, status, ms, sprite, at: new Date().toISOString() }) + "\n");
}

const routeShape = (path: string) => path.split("?")[0].replace(/[0-9a-f]{8,}[0-9a-f-]*/gi, ":id");

export async function call(conn: string, method: string, path: string, body?: unknown, extra: RequestInit = {}): Promise<Response> {
  if (killSwitch()) throw new Error("kill switch is on: partner calls are stopped");
  const t0 = Date.now();
  const url = (await base(conn)) + path;
  const headers: Record<string, string> = { accept: "application/json", ...(extra.headers as Record<string, string> | undefined) };
  for (const k of Object.keys(headers)) if (k.toLowerCase() === "authorization") throw new Error("refusing to send an Authorization header");
  const init: RequestInit = { method, ...extra, headers };
  if (body !== undefined) {
    if (body instanceof Uint8Array || typeof body === "string" || body instanceof FormData) init.body = body as BodyInit;
    else {
      headers["content-type"] = headers["content-type"] ?? "application/json";
      init.body = JSON.stringify(body);
    }
  }
  let status = 0;
  try {
    const r = await fetch(url, { ...init, signal: extra.signal ?? AbortSignal.timeout(60_000) });
    status = r.status;
    return r;
  } finally {
    recorder(conn, `${method} ${routeShape(path)}`, status, Date.now() - t0);
  }
}

export async function json<T = any>(conn: string, method: string, path: string, body?: unknown, extra: RequestInit = {}): Promise<T> {
  const r = await call(conn, method, path, body, extra);
  const text = await r.text();
  if (!r.ok) throw new GatewayError(conn, r.status, text.slice(0, 300));
  try { return JSON.parse(text) as T; } catch { throw new GatewayError(conn, r.status, `not JSON: ${text.slice(0, 120)}`); }
}

export class GatewayError extends Error {
  status: number;
  conn: string;
  constructor(conn: string, status: number, detail: string) {
    super(`${conn} HTTP ${status}: ${detail}`);
    this.status = status;
    this.conn = conn;
  }
}

// Measured status of one connection: a real, cheap, read-only request with a timestamp.
export async function probe(conn: string, method: string, path: string): Promise<{ conn: string; ok: boolean; status: number; ms: number; at: string; note: string }> {
  const at = new Date().toISOString();
  const t0 = Date.now();
  try {
    const r = await call(conn, method, path);
    await r.arrayBuffer();
    return { conn, ok: r.ok, status: r.status, ms: Date.now() - t0, at, note: r.ok ? "reachable through the gateway" : `HTTP ${r.status}` };
  } catch (e) {
    return { conn, ok: false, status: 0, ms: Date.now() - t0, at, note: String((e as Error).message).slice(0, 160) };
  }
}

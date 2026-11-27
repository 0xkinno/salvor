// Sprites API client used by slv-home. Reached keylessly through a custom API connector
// ("sprites-api-hands") when the platform allows it (rung a). If the probe shows it does not,
// the same calls go direct with a scoped token kept in a 0600 file on slv-home only (rung b),
// and every surface says so. Rung c is a human-run script and never reaches this file.
import { readFileSync } from "node:fs";
import { call } from "../gateway.ts";

const CONN = "sprites-api-hands";
const DIRECT = "https://api.sprites.dev";

export type Rung = "a" | "b";
export function rung(): Rung {
  return (process.env.SALVOR_SPRITES_RUNG ?? "a") === "b" ? "b" : "a";
}
export function credentialOnBox(): boolean { return rung() === "b"; }

function token(): string {
  const p = process.env.SALVOR_SPRITES_TOKEN_FILE ?? "/home/sprite/salvor/secrets/sprites-token";
  return readFileSync(p, "utf8").trim();
}

async function api(method: string, path: string, body?: unknown, extra: RequestInit = {}): Promise<Response> {
  if (rung() === "a") return call(CONN, method, path, body, extra);
  const headers: Record<string, string> = { authorization: `Bearer ${token()}`, ...(extra.headers as Record<string, string> | undefined) };
  const init: RequestInit = { method, ...extra, headers };
  if (body !== undefined) {
    if (body instanceof Uint8Array || typeof body === "string") init.body = body as BodyInit;
    else { headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
  }
  try { return await fetch(DIRECT + path, { ...init, signal: extra.signal ?? AbortSignal.timeout(120_000) }); }
  catch (e) { const c = (e as any)?.cause; if (c) throw new Error(`sprites ${method} ${path.split("?")[0]}: ${(e as Error).message} (${c.code ?? c.message ?? c})`); throw e; }
}

async function ok(r: Response, what: string): Promise<Response> {
  if (!r.ok) throw new Error(`sprites ${what} HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
  return r;
}

export type SpriteInfo = { name: string; status: string; url?: string; labels?: string[]; created_at?: string; id?: string };

export async function create(name: string): Promise<SpriteInfo> {
  if (!/^slv-[a-z0-9-]{1,40}$/.test(name)) throw new Error(`refusing to create a Sprite named "${name}"`);
  const r = await ok(await api("POST", "/v1/sprites", { name, url_settings: { auth: "sprite" } }), "create");
  return (await r.json()) as SpriteInfo;
}

export async function info(name: string): Promise<SpriteInfo> {
  return (await (await ok(await api("GET", `/v1/sprites/${name}`), "get")).json()) as SpriteInfo;
}

export async function list(prefix = "slv-"): Promise<SpriteInfo[]> {
  const j: any = await (await ok(await api("GET", "/v1/sprites"), "list")).json();
  const arr: SpriteInfo[] = Array.isArray(j) ? j : j.sprites ?? [];
  return arr.filter((s) => s.name.startsWith(prefix));
}

export async function remove(name: string): Promise<void> {
  if (!name.startsWith("slv-")) throw new Error("refusing to delete a Sprite outside slv-*");
  await ok(await api("DELETE", `/v1/sprites/${name}`), "delete");
}

// Labels: the documented REST surface has no label route; the CLI sets them. Try the shapes
// that could carry them and verify by reading back. Returns how it was achieved.
export async function setLabels(name: string, labels: string[]): Promise<{ ok: boolean; route: string; labels: string[] }> {
  const attempts: [string, string][] = [["PUT", `/v1/sprites/${name}`], ["PATCH", `/v1/sprites/${name}`]];
  for (const [m, p] of attempts) {
    try {
      const r = await api(m, p, { labels });
      await r.arrayBuffer();
      const now = await info(name);
      if (labels.every((l) => (now.labels ?? []).includes(l))) return { ok: true, route: `${m} ${p}`, labels: now.labels ?? [] };
    } catch { /* try next shape */ }
  }
  return { ok: false, route: "none of PUT or PATCH /v1/sprites/{name} accepted labels", labels: (await info(name)).labels ?? [] };
}

export async function setNetworkPolicy(name: string, rules: { domain?: string; action?: string; include?: string }[]) {
  await ok(await api("POST", `/v1/sprites/${name}/policy/network`, { rules }), "network policy");
}
export async function getNetworkPolicy(name: string) {
  return (await ok(await api("GET", `/v1/sprites/${name}/policy/network`), "get network policy")).json();
}

export async function writeFile(name: string, path: string, content: string | Uint8Array, mode = "0644") {
  const body = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const q = `path=${encodeURIComponent(path)}&mode=${mode}&mkdir=true`;
  await ok(await api("PUT", `/v1/sprites/${name}/fs/write?${q}`, body, { headers: { "content-type": "application/octet-stream" } }), "write file");
}
export async function readFile(name: string, path: string): Promise<Uint8Array> {
  const r = await ok(await api("GET", `/v1/sprites/${name}/fs/read?path=${encodeURIComponent(path)}`), "read file");
  return new Uint8Array(await r.arrayBuffer());
}

export type ExecResult = { stdout: string; stderr: string; code: number; ms: number; raw_frames: boolean };

// Frames: 0x01 stdout, 0x02 stderr, 0x03 exit. JSON bodies are accepted too. The exact wire
// format is confirmed by the probe (Q-exec in FINDINGS.md) and recorded in PLATFORM_PROBE.md.
export function parseExec(buf: Uint8Array, contentType = ""): Omit<ExecResult, "ms"> {
  if (contentType.includes("json")) {
    const j: any = JSON.parse(new TextDecoder().decode(buf));
    return { stdout: String(j.stdout ?? ""), stderr: String(j.stderr ?? ""), code: Number(j.exit_code ?? j.code ?? 0), raw_frames: false };
  }
  const hasMarkers = buf.length > 0 && (buf[0] === 1 || buf[0] === 2 || buf[0] === 3);
  if (!hasMarkers) return { stdout: new TextDecoder().decode(buf), stderr: "", code: 0, raw_frames: false };
  const out: number[] = [], err: number[] = [];
  let code = 0, cur = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b === 1 || b === 2 || b === 3) { cur = b; if (b === 3) { const n = buf[i + 1]; if (n !== undefined && n < 128 && !(n >= 48 && n <= 57)) { code = n; i++; } } continue; }
    if (cur === 1) out.push(b);
    else if (cur === 2) err.push(b);
    else if (cur === 3 && b >= 48 && b <= 57) code = code * 10 + (b - 48);
  }
  return { stdout: new TextDecoder().decode(Uint8Array.from(out)), stderr: new TextDecoder().decode(Uint8Array.from(err)), code, raw_frames: true };
}

export async function exec(name: string, argv: string[], opts: { env?: Record<string, string>; dir?: string; stdin?: string } = {}): Promise<ExecResult> {
  const t0 = Date.now();
  const q = new URLSearchParams();
  for (const a of argv) q.append("cmd", a);
  for (const [k, v] of Object.entries(opts.env ?? {})) q.append("env", `${k}=${v}`);
  if (opts.dir) q.set("dir", opts.dir);
  if (opts.stdin !== undefined) q.set("stdin", "true");
  const r = await ok(
    await api("POST", `/v1/sprites/${name}/exec?${q}`, opts.stdin !== undefined ? new TextEncoder().encode(opts.stdin) : undefined, {
      headers: { "content-type": "application/octet-stream" }, signal: AbortSignal.timeout(180_000),
    }),
    "exec",
  );
  const parsed = parseExec(new Uint8Array(await r.arrayBuffer()), r.headers.get("content-type") ?? "");
  return { ...parsed, ms: Date.now() - t0 };
}
// Alias used by the notary.
export const execIn = exec;

export async function checkpoint(name: string, comment: string): Promise<{ id: string | null; raw: string }> {
  const r = await ok(await api("POST", `/v1/sprites/${name}/checkpoint`, { comment }), "checkpoint");
  const raw = await r.text();
  const ids = [...raw.matchAll(/\bv\d+\b/g)].map((m) => m[0]);
  return { id: ids.length ? ids[ids.length - 1] : null, raw: raw.slice(0, 600) };
}
export async function listCheckpoints(name: string): Promise<any[]> {
  const j: any = await (await ok(await api("GET", `/v1/sprites/${name}/checkpoints`), "list checkpoints")).json();
  return Array.isArray(j) ? j : j.checkpoints ?? [];
}
export async function restore(name: string, id: string) {
  const r = await ok(await api("POST", `/v1/sprites/${name}/checkpoints/${id}/restore`), "restore");
  await r.arrayBuffer();
}

export type Usage = { cpu_time_sec: number; reserved_memory_byte_sec: number; partial: boolean; rows: number; start: string; end: string };
export async function usage(name: string, startIso: string, endIso?: string): Promise<Usage> {
  const q = new URLSearchParams({ start: startIso });
  if (endIso) q.set("end", endIso);
  const j: any = await (await ok(await api("GET", `/v1/usage/${name}?${q}`), "usage")).json();
  let cpu = 0, mem = 0;
  for (const u of j.usage ?? []) { cpu += Number(u.cpu_time_sec ?? 0); mem += Number(u.reserved_memory_byte_sec ?? 0); }
  return { cpu_time_sec: cpu, reserved_memory_byte_sec: mem, partial: Boolean(j.partial), rows: (j.usage ?? []).length, start: j.start, end: j.end };
}

// TEST HARNESS ONLY. A local stand-in for the Sprites API, the gateway and the partner APIs, used to
// run the pipeline logic in CI. It proves our code paths, not the platform: platform behaviour is
// proven by scripts/probe.mjs and the break campaign on real accounts, and /api/status labels this
// mode "local-emulator" whenever it is in use.
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, cpSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

export type Emu = {
  url: string; listUrl: string; root: string; close: () => Promise<void>;
  datasets: Record<string, any[]>;
  sprites: Map<string, { dir: string; labels: string[]; policy: any[]; created: string; checkpoints: number }>;
  calls: { route: string; method: string }[];
  failJev: boolean; sabotageVariant: boolean;
};

const FAKE_SPRITE_ENV = `#!/usr/bin/env bash
# fake sprite-env: copies the evidence dir into a numbered read-only-ish checkpoint folder
root="$EMU_SPRITE_DIR"
n=$(ls -d "$root"/.sprite/checkpoints/v* 2>/dev/null | wc -l | tr -d ' ')
mkdir -p "$root/.sprite/checkpoints/v$n/home/sprite/salvor"
cp -r "$root/home/sprite/salvor/evidence" "$root/.sprite/checkpoints/v$n/home/sprite/salvor/" 2>/dev/null
echo "Checkpoint created: v$n"
`;

function tokens(s: string): string[] { return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean); }
function vec(s: string): number[] {
  const v = new Array(64).fill(0);
  for (const t of tokens(s)) { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 64; v[h] += 1; }
  return v;
}

export async function startEmulator(): Promise<Emu> {
  const root = mkdtempSync(join(tmpdir(), "salvor-emu-"));
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(join(root, "bin", "sprite-env"), FAKE_SPRITE_ENV);
  chmodSync(join(root, "bin", "sprite-env"), 0o755);
  const emu: Emu = { url: "", listUrl: "", root, close: async () => {}, datasets: {}, sprites: new Map(), calls: [], failJev: false, sabotageVariant: false };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url!, "http://x");
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const json = (code: number, o: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    emu.calls.push({ route: u.pathname, method: req.method! });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    if (u.pathname === "/v1/gateway/list") {
      // The custom connector for the Sprites API forwards paths onto the API root, so its base is the root.
      const c = (name: string, provider: string) => ({ provider, display_name: name, gateway_base_url: name === "sprites-api-hands" ? base : `${base}/gw/${name}` });
      return json(200, { connections: [
        c("apify-eyes", "apify"), c("jev-eyes", "typesafe"), c("pinecone-read", "pinecone"), c("pinecone-write", "pinecone"),
        c("ollama-hands", "ollama"), c("box-hands", "box"), c("mail-hands", "agentmail"), c("sprites-api-hands", "custom_api"),
      ], available: [] });
    }
    // ---- partner APIs behind the gateway
    const gw = /^\/gw\/([^/]+)(\/.*)$/.exec(u.pathname);
    if (gw) {
      const [, name, path] = gw;
      const data = body.length ? JSON.parse(body.toString()) : null;
      if (name === "apify-eyes" && /\/v2\/datasets\/([^/]+)\/items/.test(path)) return json(200, emu.datasets[/datasets\/([^/]+)\//.exec(path)![1]] ?? []);
      if (name === "jev-eyes" && path === "/v1/decisions") {
        if (emu.failJev) return json(503, { error: "emulated outage" });
        const l = data.state.listing, line = data.state.receipt_line;
        const title = `${l.title ?? ""} ${l.variant ?? ""}`.toLowerCase();
        const want = String(line.raw_text).toLowerCase();
        const qtWant = /(\d+)\s?qt|(\d+)\s?quart/.exec(want), qtGot = /(\d+)\s?qt|(\d+)\s?quart/.exec(title);
        const same = qtWant && qtGot && (qtWant[1] ?? qtWant[2]) !== (qtGot[1] ?? qtGot[2]) ? "other_variant" : tokens(want).some((t) => tokens(title).includes(t)) ? "exact" : "other_product";
        return json(200, { model: "jev-emulated", answers: {
          same_item: { type: "choice", choice: same, confidence: 0.96, probabilities: { [same]: 0.96 } }, owed: { type: "noul", noul: 0.91 } }, usage: { input_tokens: 100, output_tokens: 10 } });
      }
      if (name.startsWith("pinecone") && path === "/embed") return json(200, { data: data.inputs.map((i: any) => ({ values: vec(i.text) })) });
      if (name.startsWith("pinecone") && path === "/rerank") {
        return json(200, { data: data.documents.map((d: any, index: number) => ({ index, score: tokens(d.text).filter((t) => tokens(data.query).includes(t)).length / Math.max(1, tokens(data.query).length) })) });
      }
      if (name === "ollama-hands" && path === "/api/chat") {
        const prompt: string = data.messages[0].content;
        const facts = JSON.parse(prompt.slice(prompt.indexOf("{"), prompt.lastIndexOf("}") + 1));
        return json(200, { message: { content: `Hello. I bought ${facts.item} on ${facts.purchased} for ${facts.paid}. It is now ${facts.now}. Under ${facts.clause} please match the price, a difference of ${facts.owed}. Thank you.` } });
      }
      return json(404, { error: `emulator has no route ${name} ${path}` });
    }
    // ---- Sprites API
    const m = /^\/v1\/sprites(?:\/([^/]+))?(?:\/(.*))?$/.exec(u.pathname);
    if (m) {
      const [, name, rest] = m;
      if (!name && req.method === "POST") {
        const { name: n } = JSON.parse(body.toString());
        const dir = join(root, n); mkdirSync(join(dir, "home/sprite/salvor"), { recursive: true });
        emu.sprites.set(n, { dir, labels: [], policy: [], created: new Date().toISOString(), checkpoints: 0 });
        return json(201, { name: n, status: "warm", labels: [] });
      }
      const sp = name ? emu.sprites.get(name) : undefined;
      if (name && !sp) return json(404, { error: "not found" });
      if (name && !rest && req.method === "GET") return json(200, { name, status: "warm", labels: sp!.labels });
      if (name && !rest && req.method === "PUT") { const b = JSON.parse(body.toString()); if (b.labels) sp!.labels = b.labels; return json(200, { name, labels: sp!.labels }); }
      if (name && !rest && req.method === "DELETE") { emu.sprites.delete(name); return json(200, {}); }
      if (rest === "policy/network" && req.method === "POST") { sp!.policy = JSON.parse(body.toString()).rules; return json(200, {}); }
      if (rest === "fs/write" && req.method === "PUT") {
        const p = u.searchParams.get("path")!; const full = join(sp!.dir, p);
        mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, body); return json(200, { path: p, size: body.length, mode: "0644" });
      }
      if (rest === "checkpoint" && req.method === "POST") {
        const c = spawn("bash", [join(root, "bin", "sprite-env")], { env: { ...process.env, EMU_SPRITE_DIR: sp!.dir } });
        let out = ""; c.stdout.on("data", (d) => (out += d)); await new Promise((r) => c.on("close", r));
        res.writeHead(200, { "content-type": "application/x-ndjson" }); return res.end(JSON.stringify({ type: "complete", message: out.trim() }) + "\n");
      }
      if (rest === "exec" && req.method === "POST") {
        const cmd = u.searchParams.getAll("cmd");
        const map = (p: string) => (p.startsWith("/home/sprite/salvor") || p.startsWith("/.sprite/checkpoints") ? join(sp!.dir, p) : p);
        let argv = cmd.map(map);
        if (cmd[0] === "sh") argv = ["sh", "-c", "echo 1000000"];
        const env = { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, EMU_SPRITE_DIR: sp!.dir, SALVOR_DIR: join(sp!.dir, "home/sprite/salvor"),
          SALVOR_GATEWAY_LIST: emu.listUrl, SPRITE_NAME: name!, ...(emu.sabotageVariant ? { SALVOR_SABOTAGE: "variant" } : {}) };
        const c = spawn(argv[0], argv.slice(1), { env, cwd: sp!.dir });
        let out = "", err = ""; c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (err += d));
        const code: number = await new Promise((r) => c.on("close", (x) => r(x ?? 1)));
        res.writeHead(200, { "content-type": "application/octet-stream" });
        return res.end(Buffer.concat([Buffer.from([1]), Buffer.from(out), Buffer.from([2]), Buffer.from(err), Buffer.from([3, code])]));
      }
      return json(404, { error: `emulator has no sprites route ${rest}` });
    }
    const us = /^\/v1\/usage\/([^/]+)$/.exec(u.pathname);
    if (us) return json(200, { start: u.searchParams.get("start"), end: new Date().toISOString(), interval: null, partial: false, usage: [{ cpu_time_sec: 12.5, reserved_memory_byte_sec: 3.1e9, start: "", end: "", last_recorded_at: null }] });
    return json(404, { error: "emulator: no such route " + u.pathname });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  emu.url = `http://127.0.0.1:${port}`;
  emu.listUrl = `${emu.url}/v1/gateway/list`;
  emu.close = () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); });
  return emu;
}

export function readEvidence(emu: Emu, sprite: string, day: string): string | null {
  const p = join(emu.sprites.get(sprite)!.dir, "home/sprite/salvor/evidence", `${day}.json`);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}
export { readdirSync, cpSync };

// Deploy slv-home: create the Sprite, upload the app, set the service on port 8080, make the URL
// public, create the judge pool. Safe to re-run. Needs SPRITES_TOKEN (local only).
//   node scripts/deploy-home.mjs [--no-pool] [--env KEY=VALUE ...]
// Deploying over a URL already in a submission needs the owner's go-ahead (plan, Part 0 rule 3).
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { need, sp, run, sleep } from "./lib/api.mjs";

need("SPRITES_TOKEN");
const HOME = "slv-home";
const ROOT = "/home/sprite/salvor";
const args = process.argv.slice(2);
const extraEnv = {};
for (let i = 0; i < args.length; i++) if (args[i] === "--env") { const [k, ...v] = args[++i].split("="); extraEnv[k] = v.join("="); }

execFileSync("node", ["scripts/build-worker.mjs"], { stdio: "inherit" });
if (!existsSync("web/dist/index.html")) { console.error("web/dist is missing: run npm run build:web first"); process.exit(1); }

// ---- 1. the Sprite
let info = await sp("GET", `/v1/sprites/${HOME}`);
if (info.status === 404) {
  info = await sp("POST", "/v1/sprites", { name: HOME, url_settings: { auth: "public" } });
  console.log(`created ${HOME}: HTTP ${info.status}`);
  if (!info.ok) { console.error(info.text); process.exit(1); }
} else console.log(`${HOME} exists (${info.json?.status})`);
const pub = await sp("PUT", `/v1/sprites/${HOME}`, { url_settings: { auth: "public" } });
console.log(`url auth public: HTTP ${pub.status}`);
const lab = await sp("PUT", `/v1/sprites/${HOME}`, { labels: ["salvor-hands"] });
console.log(`labels salvor-hands via REST: HTTP ${lab.status} (see FINDINGS Q2; policy falls back to name prefix)`);

// ---- 2. files
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (!["node_modules", ".git"].includes(f)) walk(p, out); } else out.push(p);
  }
  return out;
}
const files = [
  ...walk("src"), "package.json", "dist/receipt-worker.mjs", ...walk("web/dist"),
  ...(existsSync("docs/FACTS.json") ? ["docs/FACTS.json"] : []), ...(existsSync("docs/hero-run.json") ? ["docs/hero-run.json"] : []),
  ...(existsSync("config/connections.json") ? ["config/connections.json"] : []),
  ...(existsSync("evidence/runs") ? walk("evidence/runs") : []),
  ...["target-price-match-help.txt", "target-holiday-fact-sheet.txt", "fly-pricing.txt"].map((f) => `evidence/snapshots/${f}`).filter(existsSync),
];
let n = 0;
for (const f of files) {
  const body = readFileSync(f);
  const r = await sp("PUT", `/v1/sprites/${HOME}/fs/write?path=${encodeURIComponent(`${ROOT}/${f}`)}&mkdir=true&mode=0644`, new Uint8Array(body), { headers: { "content-type": "application/octet-stream" } });
  if (!r.ok) { console.error(`write ${f}: HTTP ${r.status} ${r.text.slice(0, 120)}`); process.exit(1); }
  n++;
}
console.log(`uploaded ${n} files to ${ROOT}`);

// ---- 3. secrets that guard Salvor's own routes (they open no partner account)
mkdirSync(".salvor-local", { recursive: true });
const sf = ".salvor-local/secrets.json";
const secrets = existsSync(sf) ? JSON.parse(readFileSync(sf, "utf8")) : {};
for (const k of ["SALVOR_HOUSEHOLD_TOKEN", "SALVOR_HOOK_SECRET", "SALVOR_TICK_SECRET"]) secrets[k] ??= randomBytes(24).toString("base64url");
writeFileSync(sf, JSON.stringify(secrets, null, 2), { mode: 0o600 });

// ---- 4. the service
const env = { PORT: "8080", NODE_NO_WARNINGS: "1", SALVOR_PUBLIC_DEMO: "1", ...secrets, ...extraEnv };
if (Object.values(env).some((v) => String(v).includes(","))) { console.error("service env values may not contain commas"); process.exit(1); }
const envArg = Object.entries(env).map(([k, v]) => `${k}=${v}`).join(",");
await run(HOME, ["sprite-env", "services", "delete", "web"]).catch(() => {});
const svc = await run(HOME, ["sprite-env", "services", "create", "web", "--cmd", "node", "--args", "src/home/server.ts", "--dir", ROOT, "--http-port", "8080", "--env", envArg, "--no-stream"]);
console.log(`service create: exit ${svc.code} ${svc.stdout.slice(0, 160)} ${svc.stderr.slice(0, 160)}`);
await sleep(2500);
const node = await run(HOME, ["node", "-v"]);
console.log(`node on the Sprite: ${node.stdout.trim()}`);

const url = info.json?.url ?? (await sp("GET", `/v1/sprites/${HOME}`)).json?.url;
console.log(`\nURL: ${url}`);
if (url) {
  for (const p of ["/health", "/api/status", "/"]) {
    const r = await fetch(url.replace(/\/$/, "") + p, { signal: AbortSignal.timeout(30_000) }).catch((e) => ({ status: `error ${e.message}` }));
    console.log(`${p} -> ${r.status}`);
  }
}
console.log("\nsecrets are in .salvor-local/secrets.json (gitignored, 0600)");

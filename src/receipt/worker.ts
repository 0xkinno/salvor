// Entry point bundled to dist/receipt-worker.mjs and written into each receipt Sprite.
//   node receipt-worker.mjs observe <runId> <datasetId> <observedAtIso>
//   node receipt-worker.mjs selftest      (what may this Sprite reach? used by the break campaign)
//   node receipt-worker.mjs tamper        (edit today's evidence file after its checkpoint)
//   node receipt-worker.mjs whoami        (labels, egress policy, no-keys check)
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { setRecorder, call } from "../gateway.ts";
import { observe, type Report } from "./observe.ts";
import { DIR } from "./evidence.ts";
import { resolve, trynew } from "./resolve.ts";
import { lastRun } from "../connectors/apify.ts";
import { matchListing, pickBest } from "../connectors/pinecone.ts";
import { decide } from "../match.ts";

const calls: Report["calls"] = [];
setRecorder((provider, route, status, ms) => calls.push({ provider, route, status, ms }));

function out(o: unknown) { process.stdout.write(JSON.stringify(o)); }

async function selftest() {
  const results: Record<string, unknown> = {};
  // (c) the gateway must refuse hands-only connections for an eyes Sprite.
  for (const [name, method, path] of [
    ["mail-hands", "GET", "/v0/auth/me"],
    ["sprites-api-hands", "GET", "/v1/sprites"],
  ] as const) {
    try { const r = await call(name, method, path); results[name] = { status: r.status, body: (await r.text()).slice(0, 120) }; }
    catch (e) { results[name] = { error: String((e as Error).message).slice(0, 160) }; }
  }
  // (d) store sites must not resolve.
  for (const host of ["www.target.com", "www.bestbuy.com", "example.com"]) {
    try {
      const r = await fetch(`https://${host}/`, { signal: AbortSignal.timeout(6000) });
      results[host] = { reached: true, status: r.status };
    } catch (e) { results[host] = { reached: false, error: String((e as Error).cause ?? (e as Error).message).slice(0, 120) }; }
  }
  let policy: unknown = null;
  try { policy = JSON.parse(readFileSync("/.sprite/policy/network.json", "utf8")); } catch (e) { policy = { unreadable: String((e as Error).message) }; }
  results.network_policy = policy;
  // The policy file must be read only from inside.
  try { writeFileSync("/.sprite/policy/network.json", "{}"); results.policy_writable = true; } catch { results.policy_writable = false; }
  return results;
}

function whoami() {
  const env = Object.keys(process.env).filter((k) => /key|token|secret|password/i.test(k));
  let files: string[] = [];
  try { files = readdirSync(DIR); } catch { /* none */ }
  let labels: unknown = null;
  try { labels = execFileSync("sprite-env", ["info"], { encoding: "utf8", timeout: 8000 }).slice(0, 400); } catch { /* optional */ }
  return { sprite: process.env.SPRITE_NAME ?? null, secret_like_env_vars: env, dir: DIR, files, info: labels, node: process.version };
}

function tamper() {
  const day = new Date().toISOString().slice(0, 10);
  const days = readdirSync(`${DIR}/evidence`).filter((f) => f.endsWith(".json")).sort();
  const f = `${DIR}/evidence/${days[days.length - 1]}`;
  const text = readFileSync(f, "utf8");
  writeFileSync(f, text.replace(/"price_cents": \d+/, '"price_cents": 1'));
  return { tampered: f, day, was_present: existsSync(f) };
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "observe") {
    const [runId, datasetId, observedAt] = args;
    if (!runId || !datasetId || !observedAt) throw new Error("usage: observe <runId> <datasetId> <observedAtIso>");
    out(await observe(runId, datasetId, observedAt, calls));
  } else if (cmd === "observe-latest") {
    // Backup knock: find the newest successful scheduled run ourselves, then observe it. The
    // run id makes this idempotent with the webhook path.
    const [task] = args;
    if (!task) throw new Error("usage: observe-latest <apifyTaskId>");
    const run = await lastRun(task);
    out(await observe(run.id, run.defaultDatasetId, run.finishedAt ?? new Date().toISOString(), calls));
  } else if (cmd === "match-batch") {
    // P3: read labelled pairs from stdin ([{id, line, listing}]). Returns the match with Pinecone's rerank score
    // and the same rules without it, so the value of Pinecone can be measured.
    const pairs = JSON.parse(readFileSync(0, "utf8"));
    const res = [];
    for (const p of pairs) {
      try {
        const m = await matchListing({ raw_text: p.line }, p.listing);
        const withP = decide({ raw_text: p.line }, p.listing, m.rerank_score), without = decide({ raw_text: p.line }, p.listing, null);
        res.push({ id: p.id, full: { same: withP.same, conf: withP.sameConf }, rules: { same: without.same, conf: without.sameConf }, rerank: m.rerank_score, embed: m.embed_cos });
      } catch (e) { res.push({ id: p.id, error: String((e as Error).message).slice(0, 120) }); }
    }
    out(res);
  } else if (cmd === "rank-batch") {
    // P3b: for each receipt line, rank all candidate listings with Pinecone's rerank. Returns the top three ids.
    const { lines, docs } = JSON.parse(readFileSync(0, "utf8"));
    const res = [];
    for (const l of lines) {
      try { const r = await pickBest({ raw_text: l.line }, docs.map((d: any) => ({ id: d.id, title: d.text }))); res.push({ id: l.id, top: r.slice(0, 3).map((x) => x.id), score: r[0]?.score ?? null }); }
      catch (e) { res.push({ id: l.id, error: String((e as Error).message).slice(0, 120) }); }
    }
    out(res);
  } else if (cmd === "resolve") out(await resolve());
  else if (cmd === "try") {
    const [url, paid, date, retailer] = args;
    out(await trynew(url, Number(paid), date, retailer === "bestbuy" ? "bestbuy" : "target"));
  } else if (cmd === "selftest") out(await selftest());
  else if (cmd === "tamper") out(tamper());
  else if (cmd === "whoami") out(whoami());
  else { process.stderr.write("unknown command\n"); process.exit(2); }
} catch (e) {
  out({ error: String((e as Error).message) });
  process.exit(1);
}

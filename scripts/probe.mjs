// Day-one platform probe (G5). Answers FINDINGS.md Q1 to Q8, Q12, Q16, Q17 on a real account and
// writes PLATFORM_PROBE.md plus a redacted JSON log. Nothing is assumed: each step records the
// request it made and the answer it got, including failures.
//   SPRITES_TOKEN=... node scripts/probe.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { need, sp, run, sleep, redact, writeJson } from "./lib/api.mjs";

need("SPRITES_TOKEN");
const P = "slv-r-probe", P2 = "slv-r-probe2";
const out = { started: new Date().toISOString(), steps: {} };
const step = async (name, fn) => {
  const t0 = Date.now();
  try { out.steps[name] = { ok: true, ms: 0, ...(await fn()) }; }
  catch (e) { out.steps[name] = { ok: false, error: String(e.message).slice(0, 300) }; }
  out.steps[name].ms = Date.now() - t0;
  console.log(`${out.steps[name].ok ? "ok  " : "FAIL"} ${name} (${out.steps[name].ms}ms)`);
};

await step("Q8 account and create latency", async () => {
  const list = await sp("GET", "/v1/sprites");
  const count = (Array.isArray(list.json) ? list.json : list.json?.sprites ?? []).length;
  await sp("DELETE", `/v1/sprites/${P}`).catch(() => {});
  const c = await sp("POST", "/v1/sprites", { name: P, url_settings: { auth: "sprite" } });
  const first = await run(P, ["sh", "-c", "echo hi; node -v; uname -sr; id -un"]);
  const second = await run(P, ["echo", "warm"]);
  return { sprites_before: count, create_status: c.status, create_ms: c.ms, first_exec_ms: first.ms, warm_exec_ms: second.ms, node: first.stdout.split("\n")[1], uname: first.stdout.split("\n")[2], user: first.stdout.split("\n")[3] };
});

await step("Q12 exec wire format", async () => {
  const r = await run(P, ["sh", "-c", "echo out; echo err 1>&2; exit 3"]);
  return { framed: r.framed, stdout: r.stdout, stderr: r.stderr, exit_code: r.code, first_bytes_hex: r.hex, http_status: r.status };
});

await step("Q2 labels via REST", async () => {
  const tries = [];
  for (const [m, body] of [["PUT", { labels: ["salvor-eyes"] }], ["PATCH", { labels: ["salvor-eyes"] }], ["PUT", { labels: ["salvor-eyes"], url_settings: { auth: "sprite" } }]]) {
    const r = await sp(m, `/v1/sprites/${P}`, body);
    tries.push({ m, status: r.status, body: r.text.slice(0, 160) });
  }
  const after = await sp("GET", `/v1/sprites/${P}`);
  const cli = await run(P, ["sh", "-c", "command -v sprite; command -v sprite-env; ls /.sprite 2>&1 | head -20"]);
  return { tries, labels_after: after.json?.labels ?? null, labels_set: (after.json?.labels ?? []).includes("salvor-eyes"), tools_inside: cli.stdout.trim() };
});

await step("Q3 egress policy and DNS", async () => {
  const set = await sp("POST", `/v1/sprites/${P}/policy/network`, { rules: [{ domain: "api.sprites.dev", action: "allow" }] });
  await sleep(2500);
  const probe = await run(P, ["sh", "-c",
    "for h in api.sprites.dev www.target.com example.com; do printf '%s: ' $h; (getent hosts $h >/dev/null 2>&1 && echo resolves) || echo refused-or-failed; done;" +
    "curl -s -m 8 -o /dev/null -w 'gateway-list http=%{http_code}\\n' https://api.sprites.dev/v1/gateway/list;" +
    "curl -s -m 6 -o /dev/null -w 'target http=%{http_code} err=%{errormsg}\\n' https://www.target.com/ || true;" +
    "cat /.sprite/policy/network.json; echo; (echo '{}' > /.sprite/policy/network.json) 2>&1 | head -1; echo write-attempt-done"]);
  return { set_status: set.status, from_inside: probe.stdout };
});

await step("Q4 and Q17 checkpoints from inside", async () => {
  const t0 = Date.now();
  const r = await run(P, ["sh", "-c", "mkdir -p /home/sprite/salvor/evidence && echo probe-$(date +%s) > /home/sprite/salvor/evidence/p.json && sprite-env checkpoints create --comment probe 2>&1; echo '--- mount'; ls /.sprite/checkpoints/ 2>&1; echo '--- file'; for v in /.sprite/checkpoints/v*; do cat $v/home/sprite/salvor/evidence/p.json 2>&1; done"]);
  const rest = await sp("POST", `/v1/sprites/${P}/checkpoint`, { comment: "probe-rest" });
  const list = await sp("GET", `/v1/sprites/${P}/checkpoints`);
  return { exec_ms: Date.now() - t0, inside: r.stdout, exit: r.code, rest_status: rest.status, rest_body: rest.text.slice(0, 300), list_body: list.text.slice(0, 400) };
});

await step("Q7 usage of a deleted Sprite", async () => {
  await sp("DELETE", `/v1/sprites/${P2}`).catch(() => {});
  await sp("POST", "/v1/sprites", { name: P2 });
  await run(P2, ["sh", "-c", "i=0; while [ $i -lt 200000 ]; do i=$((i+1)); done; echo done"]);
  const start = new Date(Date.now() - 3600_000).toISOString();
  const live = await sp("GET", `/v1/usage/${P2}?start=${encodeURIComponent(start)}`);
  await sp("DELETE", `/v1/sprites/${P2}`);
  const t0 = Date.now();
  const right = await sp("GET", `/v1/usage/${P2}?start=${encodeURIComponent(start)}`);
  await sleep(45_000);
  const later = await sp("GET", `/v1/usage/${P2}?start=${encodeURIComponent(start)}`);
  return { live: { status: live.status, body: live.text.slice(0, 300) }, just_after_delete: { status: right.status, ms: Date.now() - t0, body: right.text.slice(0, 300) }, after_45s: { status: later.status, body: later.text.slice(0, 300) } };
});

await step("Q1 Q5 Q6 Q16 gateway from inside", async () => {
  const gw = await run(P, ["sh", "-c", "curl -s -m 15 https://api.sprites.dev/v1/gateway/list"]);
  let list = null; try { list = JSON.parse(gw.stdout); } catch { /* not json */ }
  const conns = (list?.connections ?? []).map((c) => ({ provider: c.provider, display_name: c.display_name, base: c.gateway_base_url }));
  const tests = [];
  for (const c of conns.slice(0, 12)) {
    const r = await run(P, ["sh", "-c", `curl -s -m 15 -w '\\nHTTP %{http_code}' ${c.base}/ | tail -c 220`]);
    tests.push({ ...c, probe_root: r.stdout.trim() });
  }
  const hands = conns.find((c) => /sprites-api/i.test(c.display_name) || /custom/i.test(c.provider));
  const q5 = hands ? await run(P, ["sh", "-c", `curl -s -m 15 -X DELETE -w '\\nHTTP %{http_code}' ${hands.base}/v1/sprites/slv-not-a-real-sprite | tail -c 200; echo; curl -s -m 15 -X POST -H 'content-type: application/json' -d '{"name":"not-our-name"}' -w '\\nHTTP %{http_code}' ${hands.base}/v1/sprites | tail -c 200`]) : null;
  return { gateway_list_http_from_inside: gw.stdout.slice(0, 120), connections: conns, root_probes: tests, eyes_sprite_against_sprites_api_connector: q5?.stdout ?? "no sprites-api connector visible to the probe Sprite" };
});

out.finished = new Date().toISOString();
mkdirSync("evidence/probe", { recursive: true });
writeJson(`evidence/probe/platform-${out.started.slice(0, 10)}.json`, out);

const md = [`# PLATFORM_PROBE.md`, ``, `Generated by \`scripts/probe.mjs\` on ${out.started}. Real account, real requests. Secrets are redacted. Failures are kept.`, ``];
for (const [k, v] of Object.entries(out.steps)) {
  md.push(`## ${k}`, ``, `Result: ${v.ok ? "ran" : "failed to run"} in ${v.ms} ms`, ``, "```json", JSON.stringify(redact(v), null, 2), "```", ``);
}
writeFileSync("PLATFORM_PROBE.md", md.join("\n"));
console.log("\nwrote PLATFORM_PROBE.md. Read it, then update FINDINGS.md answers and choose the rungs.");
await sp("DELETE", `/v1/sprites/${P}`).catch(() => {});

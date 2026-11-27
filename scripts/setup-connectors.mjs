// Create the connections in Part 4.4 of the plan through the Connectors API. Run once by the owner
// or the build agent with real keys in the environment:
//   SPRITES_TOKEN  APIFY_TOKEN  PINECONE_API_KEY  AGENTMAIL_API_KEY
// Optional: SALVOR_POLICY=labels|prefix   (default: labels, falls back to prefix and says so)
//           PINECONE_INDEX
// Keys go to the gateway and nowhere else. Nothing here is written to disk but redacted logs.
import { writeFileSync, mkdirSync } from "node:fs";
import { need, sp, logPath, appendLog, writeJson } from "./lib/api.mjs";

need("SPRITES_TOKEN");
const log = logPath(`setup-connectors-${new Date().toISOString().slice(0, 10)}.jsonl`);
const policyMode = process.env.SALVOR_POLICY ?? "labels";

// who may use a connection
const EYES = policyMode === "prefix" ? { name_prefix: "slv-r-" } : { sprite_labels: ["salvor-eyes"] };
const HANDS = policyMode === "prefix" ? { name_prefix: "slv-home" } : { sprite_labels: ["salvor-hands"] };

// Path patterns are exact or a trailing * only (docs: connectors, "Endpoint allow- and block-lists").
const WANT = [
  { name: "apify-eyes", provider: "apify", key: "APIFY_TOKEN", policy: { ...EYES, allowed_endpoints: ["/v2/acts/*", "/v2/datasets/*", "/v2/actor-runs/*", "/v2/actor-tasks/*"] } },
  // The dedicated Apify connector supports only run details and dataset reads. Listing a task's runs (for the live watch
  // summary and the backup tick) needs a named custom connector, pinned to exactly those two paths.
  ...(process.env.SALVOR_APIFY_TASK ? [{ name: "apify-history", custom: { base: "https://api.apify.com", prefix: "Bearer", test: "https://api.apify.com/v2/users/me" }, key: "APIFY_TOKEN", policy: { ...EYES, allowed_endpoints: [`/v2/actor-tasks/${process.env.SALVOR_APIFY_TASK}/runs`, `/v2/actor-tasks/${process.env.SALVOR_APIFY_TASK}/runs/last`] } }] : []),
  // Starting a run and reading its items in one request (the try-it page) is outside the dedicated connector too: a named
  // custom connector pinned to that one path of that one actor.
  { name: "apify-run", custom: { base: "https://api.apify.com", prefix: "Bearer", test: "https://api.apify.com/v2/users/me" }, key: "APIFY_TOKEN", policy: { ...EYES, allowed_endpoints: ["/v2/acts/apify~e-commerce-scraping-tool/run-sync-get-dataset-items"] } },
  // Fly allows one dedicated connector per provider, so eyes and hands each get a named custom connector.
  { name: "pinecone-read", custom: { base: "https://api.pinecone.io", header: "Api-Key", test: "https://api.pinecone.io/indexes" }, key: "PINECONE_API_KEY", policy: { ...EYES, allowed_endpoints: ["/embed", "/rerank"] } },
  { name: "pinecone-write", custom: { base: "https://api.pinecone.io", header: "Api-Key", test: "https://api.pinecone.io/indexes" }, key: "PINECONE_API_KEY", policy: { ...HANDS, allowed_endpoints: ["/embed", "/rerank"] } },
  { name: "mail-hands", provider: "agentmail", key: "AGENTMAIL_API_KEY", policy: { ...HANDS, allowed_endpoints: ["/v0/auth/me", "/v0/inboxes/*"] } },
];

const existing = await sp("GET", "/v1/oauth/connections");
appendLog(log, { step: "list", status: existing.status, body: existing.json });
const have = existing.json?.connections ?? existing.json ?? [];
console.log(`connections already present: ${Array.isArray(have) ? have.length : "unknown"}`);

const result = {};
for (const w of WANT) {
  const key = process.env[w.key];
  if (!key) { console.log(`skip ${w.name}: ${w.key} not set`); result[w.name] = { skipped: `${w.key} not set` }; continue; }
  // 1. the dedicated provider connector (BYOK). 2. If the platform refuses, a custom API connector.
  let r = w.custom
    ? await sp("POST", "/v1/oauth/connections/custom_api", { name: w.name, base_api_url: w.custom.base, access_token: key, ...(w.custom.header ? { auth_method: "custom_header", auth_custom_header_name: w.custom.header } : { auth_method: "header", auth_header_prefix: w.custom.prefix ?? "Bearer" }), test_url: w.custom.test, access_policy: w.policy })
    : await sp("POST", "/v1/oauth/connections/api_key", { provider: w.provider, api_key: key, access_policy: w.policy });
  appendLog(log, { step: `create ${w.name}`, route: "api_key", status: r.status, body: r.json ?? r.text.slice(0, 300) });
  const id = r.json?.connection?.id ?? r.json?.id;
  if (r.ok && id) {
    // Try to give it a distinct display name so the app can find it by name.
    const rn = w.custom ? { ok: true, status: 0, json: null, text: "" } : await sp("PATCH", `/v1/oauth/connections/${id}`, { display_name: w.name });
    appendLog(log, { step: `rename ${w.name}`, status: rn.status, body: rn.json ?? rn.text.slice(0, 200) });
    result[w.name] = { id, via: "dedicated connector", renamed: rn.ok, policy: w.policy, gateway_base_url: r.json?.connection?.gateway_base_url ?? null };
    console.log(`ok   ${w.name} (${w.provider ?? "custom"}) id=${id} renamed=${rn.ok}`);
  } else {
    result[w.name] = { failed: true, status: r.status, body: r.json ?? r.text.slice(0, 200) };
    console.log(`FAIL ${w.name}: HTTP ${r.status} ${r.text.slice(0, 160)}`);
  }
}

// Sprites API connector for slv-home (Q1, rung a). The token is stored by the gateway.
if (process.env.SPRITES_CONNECTOR_TOKEN || process.env.SPRITES_TOKEN) {
  const r = await sp("POST", "/v1/oauth/connections/custom_api", {
    name: "sprites-api-hands", base_api_url: "https://api.sprites.dev", access_token: process.env.SPRITES_CONNECTOR_TOKEN ?? process.env.SPRITES_TOKEN,
    auth_method: "header", auth_header_prefix: "Bearer", test_url: "https://api.sprites.dev/v1/sprites", description: "Salvor home: manage slv-* Sprites",
    access_policy: { ...HANDS, allowed_endpoints: ["/v1/sprites", "/v1/sprites/*", "/v1/usage/*"] },
  });
  appendLog(log, { step: "create sprites-api-hands", status: r.status, body: r.json ?? r.text.slice(0, 300) });
  result["sprites-api-hands"] = r.ok ? { id: r.json?.connection?.id, via: "custom api connector" } : { failed: true, status: r.status, body: r.json ?? r.text.slice(0, 200) };
  console.log(`${r.ok ? "ok  " : "FAIL"} sprites-api-hands HTTP ${r.status}`);
}

// Optional Pinecone index connections for the household memory (custom connectors at the index host).
if (process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX) {
  const d = await fetch(`https://api.pinecone.io/indexes/${process.env.PINECONE_INDEX}`, { headers: { "Api-Key": process.env.PINECONE_API_KEY, "X-Pinecone-API-Version": "2025-10" } });
  const host = (await d.json().catch(() => ({})))?.host;
  if (host) {
    for (const [name, pol, ends] of [["pinecone-index-read", EYES, ["/query"]], ["pinecone-index-write", HANDS, ["/vectors/upsert"]]]) {
      const r = await sp("POST", "/v1/oauth/connections/custom_api", { name, base_api_url: `https://${host}`, access_token: process.env.PINECONE_API_KEY, auth_method: "custom_header", auth_custom_header_name: "Api-Key", access_policy: { ...pol, allowed_endpoints: ends } });
      appendLog(log, { step: `create ${name}`, status: r.status, body: r.json ?? r.text.slice(0, 200) });
      result[name] = r.ok ? { id: r.json?.connection?.id } : { failed: true, status: r.status };
      console.log(`${r.ok ? "ok  " : "FAIL"} ${name} HTTP ${r.status}`);
    }
  } else console.log("could not read the Pinecone index host; household memory stays 'not connected'");
}

mkdirSync("config", { recursive: true });
writeJson("config/connections.json", { created_at: new Date().toISOString(), policy_mode: policyMode, connections: result });
console.log("\nwrote config/connections.json (ids only, no keys)");

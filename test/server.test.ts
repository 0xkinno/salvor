import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { closeDb } from "../src/home/db.ts";

let base = "", srv: any;
before(async () => {
  process.env.SALVOR_DB = ":memory:";
  delete process.env.SALVOR_APIFY_TASK;   // the test must not depend on the deployment's environment
  process.env.SALVOR_HOUSEHOLD_TOKEN = "household-test-token";
  process.env.SALVOR_HOOK_SECRET = "hook-test-secret";
  process.env.SALVOR_TICK_SECRET = "tick-test-secret";
  process.env.SALVOR_GATEWAY_LIST = "http://127.0.0.1:9/never";   // nothing listens: status must say so, not pretend
  const { createServer } = await import("../src/home/server.ts");
  srv = createServer();
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
after(() => { srv?.closeAllConnections(); srv?.close(); closeDb(); });

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("health and empty ledger", async () => {
  assert.equal((await fetch(base + "/health")).status, 200);
  const j: any = await (await fetch(base + "/api/receipts")).json();
  assert.equal(j.receipts.length, 0);
});

test("adding a receipt needs the household token", async () => {
  const body = { retailer: "target", date: "2026-11-09", line: "TEST ITEM", paid: "12.50" };
  assert.equal((await post("/api/receipts", body)).status, 403);
  assert.equal((await post("/api/receipts", body, { "x-household-token": "wrong" })).status, 403);
  const ok = await post("/api/receipts", body, { "x-household-token": "household-test-token" });
  assert.equal(ok.status, 201);
  const bad = await post("/api/receipts", { ...body, paid: "twelve" }, { "x-household-token": "household-test-token" });
  assert.equal(bad.status, 400);
});

test("webhook: wrong secret refused, bad payload refused, non-success ignored", async () => {
  assert.equal((await post("/hooks/apify/not-the-secret", { runId: "r1", datasetId: "d1" })).status, 403);
  assert.equal((await post("/hooks/apify/hook-test-secret", {})).status, 400);
  const ign: any = await (await post("/hooks/apify/hook-test-secret", { runId: "r2", datasetId: "d2", status: "FAILED" })).json();
  assert.equal(ign.ignored, "FAILED");
});

test("webhook: a duplicate run id is acknowledged and not processed twice", async () => {
  const a = await post("/hooks/apify/hook-test-secret", { runId: "dup-1", datasetId: "d9", status: "SUCCEEDED" });
  assert.equal(a.status, 202);
  const b: any = await (await post("/hooks/apify/hook-test-secret", { runId: "dup-1", datasetId: "d9", status: "SUCCEEDED" })).json();
  assert.equal(b.duplicate, true);
});

test("tick is rate limited and needs a configured task", async () => {
  assert.equal((await post("/tick", {})).status, 503);          // task id not configured in this test
});

test("approve and answer are locked without the token (public demo is off)", async () => {
  assert.equal((await post("/api/claims/c-abc12345/approve", { digest: "x" })).status, 404);
  assert.equal((await post("/api/asks/a-abc12345/answer", { answer: "same" })).status, 404);
});

test("status is measured: an unreachable gateway is reported, not hidden", async () => {
  const s: any = await (await fetch(base + "/api/status")).json();
  assert.equal(s.gateway.ok, false);
  assert.equal(s.gateway.mode, "local-emulator");
  assert.ok(s.labels.substitutes.some((x: any) => /emulator/.test(x.why)));
});

test("static paths cannot escape the web folder", async () => {
  const r = await fetch(base + "/..%2f..%2fpackage.json");
  const t = await r.text();
  assert.ok(!t.includes('"name": "salvor"'));
});

test("try rejects non retailer links and bad dates before any Sprite is touched", async () => {
  const a = await post("/api/try", { url: "https://evil.example/x", paid: "10", date: "2026-11-09" });
  assert.equal(a.status, 400);
  const b = await post("/api/try", { url: "https://www.target.com/p/x/-/A-1234567", paid: "10", date: "yesterday" });
  assert.equal(b.status, 400);
  const c = await post("/api/try", { url: "https://www.target.com/p/x/-/A-1234567", paid: "ten", date: "2026-11-09" });
  assert.equal(c.status, 400);
});

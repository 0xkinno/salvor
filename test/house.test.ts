import { test } from "node:test";
import assert from "node:assert/strict";
import { screenModelText, amountsIn, styleIssues } from "../src/house/style.ts";
import { parseExec } from "../src/connectors/sprites.ts";
import { normalizeListing, canonicalUrl } from "../src/connectors/apify.ts";
import { parseResponse } from "../src/connectors/jev.ts";
import { makePdf } from "../src/home/pdf.ts";

test("amountsIn reads dollars and commas", () => {
  assert.deepEqual(amountsIn("paid $1,299.99 now $79.9 and $5"), [129999, 7990, 500]);
});
test("model text with an amount outside the ledger is rejected", () => {
  const r = screenModelText("Please refund $999.00.", [5000, 12999, 7999]);
  assert.equal(r.ok, false);
});
test("model text with ledger amounts passes and dashes are cleaned", () => {
  const r = screenModelText("Paid $129.99 — now $79.99, so $50.00 is owed.", [5000, 12999, 7999]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(styleIssues(r.text).length, 0);
});
test("hype and emoji are flagged", () => {
  assert.ok(styleIssues("a seamless experience").length > 0);
  assert.ok(styleIssues("done \u{1F389}").length > 0);
});
test("parseExec reads frames and plain output", () => {
  const f = Buffer.concat([Buffer.from([1]), Buffer.from("out"), Buffer.from([2]), Buffer.from("err"), Buffer.from([3, 3])]);
  const r = parseExec(new Uint8Array(f));
  assert.equal(r.stdout, "out"); assert.equal(r.stderr, "err"); assert.equal(r.code, 3);
  assert.equal(parseExec(new TextEncoder().encode("plain")).stdout, "plain");
  assert.equal(parseExec(new TextEncoder().encode('{"stdout":"a","exit_code":2}'), "application/json").code, 2);
});
test("normalizeListing maps common actor shapes and refuses a missing price", () => {
  const l = normalizeListing({ name: "Ninja 6 Quart", brand: "Ninja", offers: { price: "79.99", availability: "InStock" }, badges: ["Clearance"] }, "2026-11-27T00:00:00Z");
  assert.equal(l.price_cents, 7999);
  assert.deepEqual(l.flags, ["clearance"]);
  assert.equal(l.in_stock, true);
  assert.throws(() => normalizeListing({ name: "x" }, "2026-11-27T00:00:00Z"));
});
test("canonicalUrl drops query and trailing slash", () => {
  assert.equal(canonicalUrl("https://www.target.com/p/x/-/A-1234567?preselect=1#a"), "https://www.target.com/p/x/-/a-1234567");
});
test("jev response parsing validates ranges and choices", () => {
  const ok = parseResponse({ model: "m", answers: { same_item: { type: "choice", choice: "exact", confidence: 0.9, probabilities: { exact: 0.9 } }, owed: { type: "noul", noul: 0.8 } } });
  assert.equal(ok.same, "exact");
  assert.throws(() => parseResponse({ answers: { same_item: { type: "choice", choice: "maybe", confidence: 0.9 }, owed: { noul: 0.5 } } }));
  assert.throws(() => parseResponse({ answers: { same_item: { type: "choice", choice: "exact", confidence: 2 }, owed: { noul: 0.5 } } }));
});
test("makePdf produces a well formed file", () => {
  const t = new TextDecoder().decode(makePdf([{ text: "Hello (world)" }]));
  assert.ok(t.startsWith("%PDF-1.4") && t.includes("startxref") && t.trim().endsWith("%%EOF"));
});

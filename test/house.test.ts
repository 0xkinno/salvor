import { test } from "node:test";
import assert from "node:assert/strict";
import { screenModelText, amountsIn, styleIssues } from "../src/house/style.ts";
import { parseExec } from "../src/connectors/sprites.ts";
import { normalizeListing, canonicalUrl } from "../src/connectors/apify.ts";
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
test("makePdf produces a well formed file", () => {
  const t = new TextDecoder().decode(makePdf([{ text: "Hello (world)" }]));
  assert.ok(t.startsWith("%PDF-1.4") && t.includes("startxref") && t.trim().endsWith("%%EOF"));
});

import { decideRules, units } from "../src/match.ts";
test("substitute decider: same item with all words and units present is exact", () => {
  const a = decideRules({ raw_text: "BELLA 6QT SLIM AIR FRYER" }, { title: "bella 6qt Slim Air Fryer Blossom" }, 0.99);
  assert.equal(a.same, "exact"); assert.ok(a.sameConf >= 0.9);
});
test("substitute decider: a different capacity is other_variant", () => {
  const a = decideRules({ raw_text: "NINJA AF161 6QT AIR FRYER" }, { title: "Ninja Foodi 8 Quart Air Fryer AF161" }, 0.97);
  assert.equal(a.same, "other_variant");
});
test("substitute decider: a different product is not a claim, and weak overlap asks", () => {
  assert.equal(decideRules({ raw_text: "DYSON V8 CORDLESS VAC" }, { title: "Stainless Steel Cookware Set" }, 0.05).same, "other_product");
  assert.ok(decideRules({ raw_text: "CROCKPOT SLOW COOKER 7QT" }, { title: "Slow Cooker 7qt" }, 0.8).sameConf < 0.9);
});
test("units reads quart words and plain units", () => {
  assert.deepEqual([...units("8 Quart and 12oz and 6qt").get("qt")!].sort(), ["6", "8"]);
  assert.ok(units("12 oz").get("oz")!.has("12"));
});

import { parseOrderEmail, parseReply, findDate, findLines } from "../src/home/intake.ts";
test("order email: store, date, lines and prices are read by rules", () => {
  const r = parseOrderEmail("Thanks for your Target order!\nOrder placed: Nov 9, 2026\nNinja AF161 6 Quart Air Fryer   $129.99\n2 x Dish Soap 3 pack  $6.49 each\nSubtotal $142.97\nTax $9.00\nOrder total $151.97\nhttps://www.target.com/p/ninja/-/A-94285420\n");
  assert.ok(!("skipped" in r));
  if (!("skipped" in r)) { assert.equal(r.retailer, "target"); assert.equal(r.purchased_date, "2026-11-09"); assert.equal(r.lines.length, 2); assert.equal(r.lines[0].paid_cents, 12999); assert.equal(r.lines[1].qty, 2); }
});
test("order email: unknown store or missing date is skipped with a reason", () => {
  assert.ok("skipped" in parseOrderEmail("Hello from nowhere\nWidget  $5.00\n"));
  assert.ok("skipped" in parseOrderEmail("Target order\nWidget item here  $5.00\n"));
});
test("dates in common formats", () => {
  assert.equal(findDate("on 2026-11-09"), "2026-11-09"); assert.equal(findDate("November 9th, 2026"), "2026-11-09"); assert.equal(findDate("11/09/2026"), "2026-11-09");
  assert.equal(findLines("Subtotal  $10.00\nTax  $1.00\n").length, 0);
});
test("reply: YES, NO and STORE become answers, quoted text is ignored", () => {
  assert.deepEqual(parseReply("Re: One question about x [ask a-1234abcd]", "Yes, that is it\n> Reply YES if"), { ask: "a-1234abcd", answer: "same" });
  assert.equal(parseReply("Re: [ask a-1234abcd]", "NO")?.answer, "different");
  assert.equal(parseReply("Re: [ask a-1234abcd]", "store")?.answer, "in_store");
  assert.equal(parseReply("Re: nothing", "yes"), null);
  assert.equal(parseReply("Re: [ask a-1234abcd]", "maybe later"), null);
});

test("substitute decider: a second quantity of the same unit cannot hide a conflict", () => {
  assert.equal(decideRules({ raw_text: "NINJA 8QT 2.5QT CRISPI PRO" }, { title: "Ninja 6qt and 2.5qt Crispi Pro Glass Containers" }, 0.6).same, "other_variant");
});
test("substitute decider: a line with no size or model number never auto-claims", () => {
  assert.ok(decideRules({ raw_text: "CUISINART AIR FRYER TOASTER OVEN" }, { title: "Cuisinart French Door Air Fryer Toaster Oven TOA-FD70" }, 0.99).sameConf < 0.9);
});

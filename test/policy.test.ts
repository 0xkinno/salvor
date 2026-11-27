import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents, fmt, diffCents, MoneyError } from "../src/policy/money.ts";
import { endOfDay, addDays, zonedInstant, localDate } from "../src/policy/time.ts";
import { evaluate, applicableClauses, PolicyError, type Line, type TypedListing } from "../src/policy/engine.ts";
import { CLAUSES } from "../src/policy/clauses.ts";
import { gate } from "../src/policy/gate.ts";

const line = (o: Partial<Line> = {}): Line => ({ paid_cents: 12999, qty: 1, purchased_date: "2026-11-09", retailer: "target", ...o });
const listing = (o: Partial<TypedListing> = {}): TypedListing => ({
  price_cents: 7999, regular_cents: 12999, seller: "Target", in_stock: true, flags: [], observed_at: "2026-11-27T11:10:00Z", ...o,
});
const at = new Date("2026-11-27T12:00:00Z");

// money
test("parseCents reads dollars exactly", () => {
  assert.equal(parseCents("$1,299.99"), 129999);
  assert.equal(parseCents("129.9"), 12990);
  assert.equal(parseCents("USD 5"), 500);
  assert.equal(parseCents(79.99), 7999);
});
test("parseCents refuses text it cannot read", () => {
  assert.throws(() => parseCents("about 80"), MoneyError);
  assert.throws(() => parseCents(""), MoneyError);
  assert.throws(() => parseCents(-1), MoneyError);
});
test("fmt formats cents", () => {
  assert.equal(fmt(5000), "$50.00");
  assert.equal(fmt(5), "$0.05");
  assert.equal(fmt(123456789), "$1,234,567.89");
});
test("diffCents never goes negative and multiplies by quantity", () => {
  assert.equal(diffCents(12999, 7999, 1), 5000);
  assert.equal(diffCents(12999, 7999, 3), 15000);
  assert.equal(diffCents(7999, 12999, 1), 0);
  assert.equal(diffCents(100, 100, 2), 0);
});
test("diffCents rejects non-integer cents and bad quantity", () => {
  assert.throws(() => diffCents(129.99 as number, 7999, 1), MoneyError);
  assert.throws(() => diffCents(12999, 7999.5 as number, 1), MoneyError);
  assert.throws(() => diffCents(12999, 7999, 0), MoneyError);
  assert.throws(() => diffCents(12999, 7999, 100), MoneyError);
});

// time
test("endOfDay handles standard time and daylight time", () => {
  assert.equal(endOfDay("2026-12-24", "America/New_York").toISOString(), "2026-12-25T04:59:59.000Z");
  assert.equal(endOfDay("2026-07-04", "America/New_York").toISOString(), "2026-07-05T03:59:59.000Z");
});
test("addDays crosses month and year", () => {
  assert.equal(addDays("2026-11-20", 14), "2026-12-04");
  assert.equal(addDays("2026-12-24", 14), "2027-01-07");
});
test("zonedInstant round trips through localDate", () => {
  const d = zonedInstant(2026, 3, 8, 12, 0, 0, "America/Chicago");
  assert.equal(localDate(d, "America/Chicago"), "2026-03-08");
});

// engine: the headline case
test("owed: air fryer paid 129.99, now 79.99, holiday guarantee", () => {
  const v = evaluate(line(), listing(), at);
  assert.equal(v.status, "owed");
  assert.equal(v.owed_cents, 5000);
  assert.equal(v.clause_id, "target-holiday-2026");
  assert.ok(v.hours_left! > 24 * 20);
});
test("quantity multiplies the amount", () => {
  assert.equal(evaluate(line({ qty: 2 }), listing(), at).owed_cents, 10000);
});
test("same price is not owed", () => {
  const v = evaluate(line(), listing({ price_cents: 12999 }), at);
  assert.equal(v.status, "not_owed");
  assert.equal(v.owed_cents, 0);
});
test("higher price is not owed", () => {
  assert.equal(evaluate(line(), listing({ price_cents: 14999 }), at).status, "not_owed");
});
test("owed is rounded down to the cent (integer cents, no float drift)", () => {
  const v = evaluate(line({ paid_cents: 1999, qty: 3 }), listing({ price_cents: 1899 }), at);
  assert.equal(v.owed_cents, 300);
  assert.equal(Number.isInteger(v.owed_cents), true);
});

// engine: boundaries
test("holiday window: last second of Dec 24 is open", () => {
  const obs = "2026-12-25T04:59:00Z";
  const v = evaluate(line(), listing({ observed_at: obs }), new Date("2026-12-25T05:00:00Z"));
  assert.equal(v.status, "owed");
});
test("holiday window: first second of Dec 25 is closed", () => {
  const v = evaluate(line(), listing({ observed_at: "2026-12-25T05:00:00Z" }), new Date("2026-12-25T05:01:00Z"));
  assert.equal(v.status, "not_owed");
  assert.match(v.reasons.join(" "), /closed/);
});
test("purchase before Nov 1 uses the 14 day clause only", () => {
  const a = applicableClauses(line({ purchased_date: "2026-10-30" }));
  assert.deepEqual(a.map((x) => x.clause.id), ["target-14day"]);
});
test("14 day clause: day 14 open, day 15 closed", () => {
  const l = line({ purchased_date: "2026-10-20" });
  assert.equal(evaluate(l, listing({ observed_at: "2026-11-03T12:00:00Z" }), new Date("2026-11-03T13:00:00Z")).status, "owed");
  const closed = evaluate(l, listing({ observed_at: "2026-11-04T12:00:00Z" }), new Date("2026-11-04T13:00:00Z"));
  assert.equal(closed.status, "not_owed");
});
test("purchase on Nov 1 gets the holiday clause", () => {
  const a = applicableClauses(line({ purchased_date: "2026-11-01" }));
  assert.ok(a.some((x) => x.clause.id === "target-holiday-2026"));
});
test("observation before the purchase date is not a drop", () => {
  const v = evaluate(line({ purchased_date: "2026-11-20" }), listing({ observed_at: "2026-11-10T12:00:00Z" }), new Date("2026-11-10T13:00:00Z"));
  assert.equal(v.status, "not_owed");
});

// engine: exclusions and holds
test("clearance is excluded", () => {
  const v = evaluate(line(), listing({ flags: ["clearance"] }), at);
  assert.equal(v.status, "not_owed");
  assert.match(v.reasons[0], /clearance/);
});
test("third party seller is excluded", () => {
  const v = evaluate(line(), listing({ seller: "Some Marketplace Shop" }), at);
  assert.equal(v.status, "not_owed");
  assert.match(v.reasons[0], /third_party_seller/);
});
test("a flag the clause does not exclude is ignored", () => {
  assert.equal(evaluate(line(), listing({ flags: ["doorbuster"] }), at).status, "owed");
});
test("unknown seller (null) is not treated as third party", () => {
  assert.equal(evaluate(line(), listing({ seller: null }), at).status, "owed");
});
test("stale reading holds the claim", () => {
  const v = evaluate(line(), listing({ observed_at: "2026-11-25T00:00:00Z" }), at);
  assert.equal(v.status, "hold");
  assert.match(v.reasons.join(" "), /hours old/);
});
test("out of stock is noted but not blocked", () => {
  const v = evaluate(line(), listing({ in_stock: false }), at);
  assert.equal(v.status, "owed");
  assert.match(v.reasons.join(" "), /out of stock/);
});
test("best buy claims carry the secondary source label and still need a person", () => {
  const v = evaluate(line({ retailer: "bestbuy" }), listing({ seller: "Best Buy" }), at);
  assert.notEqual(v.status, "hold");
  assert.match(CLAUSES["bestbuy-price-match"].title, /secondary source/);
  assert.match(CLAUSES["bestbuy-price-match"].window_note, /secondary source/);
});

// engine: must raise
test("missing price raises", () => {
  assert.throws(() => evaluate(line(), { ...listing(), price_cents: undefined as unknown as number }, at), MoneyError);
});
test("float cents raise", () => {
  assert.throws(() => evaluate(line(), listing({ price_cents: 79.99 }), at), MoneyError);
});
test("bad purchase date raises", () => {
  assert.throws(() => evaluate(line({ purchased_date: "11/09/2026" }), listing(), at), PolicyError);
});
test("future observation raises", () => {
  assert.throws(() => evaluate(line(), listing({ observed_at: "2026-11-28T12:00:00Z" }), at), PolicyError);
});
test("invalid observation time raises", () => {
  assert.throws(() => evaluate(line(), listing({ observed_at: "yesterday" }), at), PolicyError);
});

// gate
const owedVerdict = () => evaluate(line(), listing(), at);
test("gate: exact and confident and clause applies -> owed", () => {
  assert.equal(gate(owedVerdict(), { same: "exact", sameConf: 0.97, owedP: 0.9 }, false).decision, "owed");
});
test("gate: exact but below tau -> ask", () => {
  assert.equal(gate(owedVerdict(), { same: "exact", sameConf: 0.7, owedP: 0.9 }, false).decision, "ask");
});
test("gate: human confirmation overrides a low score", () => {
  assert.equal(gate(owedVerdict(), { same: "cannot_tell", sameConf: 0.3, owedP: 0.5 }, true).decision, "owed");
});
test("gate: other variant, confident -> not owed (the 8 quart case)", () => {
  assert.equal(gate(owedVerdict(), { same: "other_variant", sameConf: 0.95, owedP: 0.9 }, false).decision, "not_owed");
});
test("gate: no decision returned -> ask, never owed", () => {
  assert.equal(gate(owedVerdict(), null, false).decision, "ask");
});
test("gate: probabilities out of range raise", () => {
  assert.throws(() => gate(owedVerdict(), { same: "exact", sameConf: 1.4, owedP: 0.9 }, false));
});
test("gate: stale verdict maps to stale", () => {
  const v = evaluate(line(), listing({ observed_at: "2026-11-25T00:00:00Z" }), at);
  assert.equal(gate(v, { same: "exact", sameConf: 0.99, owedP: 0.99 }, false).decision, "stale");
});
test("gate: not owed verdict never becomes owed through confirmation", () => {
  const v = evaluate(line(), listing({ price_cents: 12999 }), at);
  assert.equal(gate(v, { same: "exact", sameConf: 0.99, owedP: 0.99 }, true).decision, "not_owed");
});

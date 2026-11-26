// The policy engine: the only place a window, a deadline or an amount is computed.
// Pure functions. Missing or malformed data raises; nothing is defaulted.
import { CLAUSES, clausesFor, type Clause, type Exclusion } from "./clauses.ts";
import { assertCents, diffCents } from "./money.ts";
import { startOfDay } from "./time.ts";

export class PolicyError extends Error {}

export type Line = {
  paid_cents: number;          // per unit, from the receipt
  qty: number;
  purchased_date: string;      // YYYY-MM-DD
  retailer: "target" | "bestbuy";
};

export type TypedListing = {
  price_cents: number;
  regular_cents: number | null;
  seller: string | null;       // who sells it on the page
  in_stock: boolean | null;
  flags: Exclusion[];          // typed exclusion signals read by the actor, never raw page text
  observed_at: string;         // ISO
};

export type Verdict = {
  status: "owed" | "not_owed" | "hold";
  owed_cents: number;
  clause_id: string | null;
  deadline: string | null;     // ISO instant
  hours_left: number | null;
  reasons: string[];
};

export const STALE_AFTER_HOURS = 36;

function isRetailerSeller(retailer: Line["retailer"], seller: string | null): boolean {
  if (seller === null) return false;
  const s = seller.trim().toLowerCase();
  return retailer === "target" ? s === "target" : s === "best buy" || s === "bestbuy";
}

// Clauses that can apply to this purchase, with their deadlines. A clause that does not
// cover the purchase date is skipped; an unverified clause is never used.
export function applicableClauses(line: Line): { clause: Clause; ends: Date }[] {
  const out: { clause: Clause; ends: Date }[] = [];
  for (const c of clausesFor(line.retailer)) {
    if (!c.verified) continue;
    if (c.purchased_from && line.purchased_date < c.purchased_from) continue;
    out.push({ clause: c, ends: c.window_end(line.purchased_date) });
  }
  return out;
}

export function evaluate(line: Line, listing: TypedListing, at: Date): Verdict {
  assertCents(line.paid_cents, "paid_cents");
  assertCents(listing.price_cents, "price_cents");
  if (!Number.isInteger(line.qty) || line.qty < 1) throw new PolicyError("quantity missing");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(line.purchased_date)) throw new PolicyError("purchase date missing or malformed");
  if (Number.isNaN(at.getTime())) throw new PolicyError("evaluation time invalid");
  const observed = new Date(listing.observed_at);
  if (Number.isNaN(observed.getTime())) throw new PolicyError("observation time invalid");

  const reasons: string[] = [];
  const hold = (r: string): Verdict => ({ status: "hold", owed_cents: 0, clause_id: null, deadline: null, hours_left: null, reasons: [...reasons, r] });

  const clauses = clausesFor(line.retailer);
  if (clauses.length === 0 || clauses.every((c) => !c.verified)) {
    return hold(`No verified ${line.retailer} price match clause is on file, so Salvor will not estimate a claim.`);
  }

  const ageH = (at.getTime() - observed.getTime()) / 3_600_000;
  if (ageH > STALE_AFTER_HOURS) return hold(`The last price reading is ${Math.round(ageH)} hours old, so it is not trusted.`);
  if (ageH < -0.1) throw new PolicyError("observation is in the future");

  // The purchase must be on or before the observation, and not before the earliest clause start.
  const applicable = applicableClauses(line);
  if (applicable.length === 0) return hold("No clause covers a purchase on this date.");

  // The drop is evaluated at the time of the observation: the lower price must exist
  // inside the clause window. Pick the clause that is open at observation time and ends last.
  const open = applicable
    .filter((a) => observed.getTime() >= startOfDay(line.purchased_date, a.clause.tz).getTime() && observed.getTime() <= a.ends.getTime())
    .sort((a, b) => b.ends.getTime() - a.ends.getTime());
  if (open.length === 0) {
    return { status: "not_owed", owed_cents: 0, clause_id: null, deadline: null, hours_left: null, reasons: ["The window to claim has closed."] };
  }
  const { clause, ends } = open[0];

  const excluded = new Set<Exclusion>(listing.flags.filter((f) => clause.excludes.includes(f)));
  if (listing.seller !== null && !isRetailerSeller(line.retailer, listing.seller)) excluded.add("third_party_seller");
  if (excluded.size > 0) {
    return {
      status: "not_owed", owed_cents: 0, clause_id: clause.id, deadline: ends.toISOString(), hours_left: null,
      reasons: [`The store excludes this kind of price: ${[...excluded].join(", ")}.`],
    };
  }
  if (listing.in_stock === false) reasons.push("The item shows as out of stock; the store may decline to match.");

  const owed = diffCents(line.paid_cents, listing.price_cents, line.qty);
  const hoursLeft = Math.max(0, (ends.getTime() - at.getTime()) / 3_600_000);
  if (owed === 0) {
    const why = listing.price_cents === line.paid_cents ? "The price is the same as you paid." : "The price is higher than you paid.";
    return { status: "not_owed", owed_cents: 0, clause_id: clause.id, deadline: ends.toISOString(), hours_left: hoursLeft, reasons: [why] };
  }
  return {
    status: "owed", owed_cents: owed, clause_id: clause.id, deadline: ends.toISOString(), hours_left: hoursLeft,
    reasons: [...reasons, "A lower price is listed inside the window."],
  };
}

export function clauseById(id: string): Clause {
  const c = CLAUSES[id];
  if (!c) throw new PolicyError(`unknown clause ${id}`);
  return c;
}

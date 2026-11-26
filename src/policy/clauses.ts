// Store clauses. Every clause carries the page it came from, the snapshot file in
// evidence/snapshots and the date we checked it. Nothing here is invented: a clause we
// could not verify is marked unverified and the engine refuses to use it.
import { addDays, endOfDay } from "./time.ts";

export type Exclusion =
  | "clearance" | "closeout" | "liquidation" | "damaged" | "used" | "open_package" | "refurbished"
  | "pre_owned" | "rent_to_own" | "min_purchase_deal" | "non_branded" | "typo_price" | "bundle"
  | "preorder" | "third_party_seller" | "contract_phone" | "pharmacy_clinic" | "gift_card_offer"
  | "coupon_or_bonus" | "limited_quantity" | "doorbuster";

export type Clause = {
  id: string;
  retailer: "target" | "bestbuy";
  title: string;
  text: string;               // the store's own words, trimmed, used in the claim packet
  source_url: string;
  snapshot: string;           // file under evidence/snapshots
  checked: string;            // YYYY-MM-DD
  verified: boolean;
  tz: string;                 // zone used for every day boundary of this clause
  purchased_from: string | null;   // earliest purchase date this clause covers
  window_end: (purchaseDate: string) => Date;
  window_note: string;
  excludes: Exclusion[];
  requires: string[];         // proof the store asks for, shown in the packet
  ask_via: string;            // where the customer asks
};

// Day boundaries use America/New_York: the earliest end of day among the US zones the
// policy covers, so a deadline is never shown later than the store would honour it.
const TZ = "America/New_York";

const TARGET_EXCLUDES: Exclusion[] = [
  "clearance", "closeout", "liquidation", "damaged", "used", "open_package", "refurbished", "pre_owned",
  "rent_to_own", "min_purchase_deal", "non_branded", "typo_price", "bundle", "preorder",
  "third_party_seller", "contract_phone", "pharmacy_clinic", "gift_card_offer", "coupon_or_bonus",
];

const TARGET_ASK =
  "Target.com or app purchases: chat online or call Guest Services at 1-800-591-3869. In-store purchases: Guest Services at a local store.";
const TARGET_REQUIRES = [
  "Original receipt, physical or digital, or packing slip",
  "Proof of the current lower price (online price or digital ad)",
];

export const CLAUSES: Record<string, Clause> = {
  "target-holiday-2026": {
    id: "target-holiday-2026",
    retailer: "target",
    title: "Target Holiday Price Match Guarantee 2026",
    text:
      "Starting November 1, 2026, if you purchase an item in store or online and the price goes lower at Target on or before December 24, 2026, you can request a price match.",
    source_url: "https://www.target.com/help/article/000062256",
    snapshot: "evidence/snapshots/target-price-match-help.txt",
    checked: "2026-11-26",
    verified: true,
    tz: TZ,
    purchased_from: "2026-11-01",
    window_end: () => endOfDay("2026-12-24", TZ),
    window_note:
      "The lower price must appear on or before 2026-12-24. The page states no separate request deadline for this guarantee, so Salvor treats 2026-12-24 as the deadline and tells you to ask as soon as you see the drop.",
    excludes: TARGET_EXCLUDES,
    requires: TARGET_REQUIRES,
    ask_via: TARGET_ASK,
  },
  "target-14day": {
    id: "target-14day",
    retailer: "target",
    title: "Target price match, 14 days after purchase",
    text:
      "Price matches may be requested at time of purchase or within 14 days after purchase. Original receipts, physical or digital, or packing slips are required for price adjustments up to 14 days after purchase.",
    source_url: "https://www.target.com/help/article/000062256",
    snapshot: "evidence/snapshots/target-price-match-help.txt",
    checked: "2026-11-26",
    verified: true,
    tz: TZ,
    purchased_from: null,
    window_end: (purchaseDate) => endOfDay(addDays(purchaseDate, 14), TZ),
    window_note: "Fourteen calendar days after the purchase date, counted to the end of that day.",
    excludes: TARGET_EXCLUDES,
    requires: TARGET_REQUIRES,
    ask_via: TARGET_ASK,
  },
  // Not verified: the page could not be read from the build environment on 2026-11-26.
  // Salvor will not file or estimate a Best Buy claim until this is checked against the live
  // policy page and a snapshot is saved. See FINDINGS.md.
  "bestbuy-price-match": {
    id: "bestbuy-price-match",
    retailer: "bestbuy",
    title: "Best Buy price match (unverified)",
    text: "",
    source_url: "https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat290300050002.c",
    snapshot: "",
    checked: "",
    verified: false,
    tz: TZ,
    purchased_from: null,
    window_end: () => { throw new Error("best buy clause is not verified"); },
    window_note: "Not verified.",
    excludes: [],
    requires: [],
    ask_via: "",
  },
};

export function clausesFor(retailer: Clause["retailer"]): Clause[] {
  return Object.values(CLAUSES).filter((c) => c.retailer === retailer);
}

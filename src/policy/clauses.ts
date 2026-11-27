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
  // Best Buy. The price match page was read through Apify on 2026-11-27 (evidence/snapshots/bestbuy-price-match.txt, effective
  // October 30, 2026): requests are made by online chat or phone during the return and exchange period; Marketplace products
  // are excluded. That page does not state the holiday purchase window or the holiday request deadline. Those two dates come
  // from a secondary source (third party guides, consistent with Best Buy's own holiday announcement, evidence/snapshots/
  // bestbuy-holiday-calendar.txt): purchases October 30 to December 31, 2026, requests until January 15, 2027. Every Best Buy
  // claim says so. A person approves every claim.
  "bestbuy-price-match": {
    id: "bestbuy-price-match",
    retailer: "bestbuy",
    title: "Best Buy Holiday Price Match (holiday dates from a secondary source: Best Buy's page does not state them)",
    text:
      "Best Buy: price match requests on BestBuy.com orders are handled by online chat or phone, made by the purchaser, during the return and exchange period. The Best Buy Price Match Guarantee does not apply to Marketplace products. Holiday dates (purchases October 30 to December 31, 2026, requests until January 15, 2027) are from a secondary source.",
    source_url: "https://www.bestbuy.com/site/price-match-guarantee/best-buy-price-match-guarantee/pcmcat297300050000.c",
    snapshot: "evidence/snapshots/bestbuy-price-match.txt",
    checked: "2026-11-27",
    verified: true,
    tz: TZ,
    purchased_from: "2026-10-30",
    window_end: (purchaseDate) => purchaseDate <= "2026-12-31" ? endOfDay("2027-01-15", TZ) : endOfDay(addDays(purchaseDate, 15), TZ),
    window_note:
      "Dates are from a secondary source (Best Buy's page does not state them): bought October 30 to December 31, 2026, ask by January 15, 2027, by chat or phone.",
    excludes: ["clearance", "closeout", "liquidation", "refurbished", "open_package", "used", "pre_owned", "third_party_seller", "contract_phone", "preorder"],
    requires: ["Order number or receipt", "Proof of the current lower Best Buy price"],
    ask_via: "BestBuy.com chat, or call 1-888-BEST BUY (1-888-237-8289). The request must be made by the purchaser.",
  },
};

export function clausesFor(retailer: Clause["retailer"]): Clause[] {
  return Object.values(CLAUSES).filter((c) => c.retailer === retailer);
}

// Money is integer cents everywhere. Amounts are computed here and nowhere else.
export class MoneyError extends Error {}

export function assertCents(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || !Number.isSafeInteger(v)) {
    throw new MoneyError(`${label} must be a non-negative integer number of cents, got ${String(v)}`);
  }
  return v;
}

// "$1,299.99", "129.99", 129.99 -> 12999. Rejects anything it cannot read exactly.
export function parseCents(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) throw new MoneyError(`bad price ${input}`);
    return Math.round(input * 100);
  }
  const s = input.trim().replace(/^USD\s*/i, "").replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new MoneyError(`cannot read price "${input}"`);
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function fmt(cents: number): string {
  assertCents(cents, "amount");
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, "0");
  return `$${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

// Owed amount: per-unit difference times quantity, never rounded up.
export function diffCents(paid: number, now: number, qty: number): number {
  assertCents(paid, "paid_cents");
  assertCents(now, "price_cents");
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new MoneyError(`quantity must be 1 to 99, got ${qty}`);
  return Math.max(0, (paid - now) * qty);
}

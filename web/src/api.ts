import { useEffect, useState } from "react";

export const money = (c: number | null | undefined) =>
  c === null || c === undefined ? "n/a" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const usd = (v: number | null | undefined, digits = 4) => (v === null || v === undefined ? "n/a" : `$${v.toFixed(digits)}`);

export async function get<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

export async function post<T>(path: string, body: unknown, token?: string): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-household-token": token } : {}) }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: data as T };
}

export type State<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

export function useGet<T>(path: string, every = 0): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => get<T>(path).then((d) => { if (live) { setData(d); setError(null); } }).catch((e) => { if (live) setError(String(e.message)); }).finally(() => { if (live) setLoading(false); });
    load();
    const t = every ? setInterval(load, every) : null;
    return () => { live = false; if (t) clearInterval(t); };
  }, [path, n, every]);
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}

export type Life = { label: string; reason: string; cost_usd?: number | null; source?: string | null };
export type Receipt = {
  life: Life;
  id: string; line_id: string; retailer: "target" | "bestbuy"; title: string; raw_text: string; purchased_at: string; paid_cents: number; qty: number;
  status: string; sprite: string | null; window_ends_at: string; days_left: number; household: string; source: string; listing_url: string | null;
  last: { observed_at: string; price_cents: number | null; decision: string; owed_cents: number | null } | null;
  claim: { id: string; amount_cents: number; approved_at: string | null; deadline: string } | null;
  ask: { id: string; question: string } | null; last_wake: string | null; next_wake: string | null;
};

export type Facts = {
  empty: boolean; n_items: number; owed_total_cents: number; share_cheaper: number | null; cost_per_receipt_usd: number | null; wrong_claim_rate: number | null;
  p1: { n_listed: number; n_items: number; share_cheaper: number | null; owed_total_cents: number; median_owed_cents: number | null; misses: { id: string; reason: string }[] };
  p2: { runs_completed: number; drops_seen: number; first_run_at: string | null; last_run_at: string | null };
  p3: any; p4: { receipts_metered: number; per_receipt_usd: number | null; per_receipt_per_day_usd: number | null; partial_rows: number };
  p5: { id: string; name: string; expected: string; observed: string; pass: boolean }[];
  hero: { item: string; paid_cents: number; now_cents: number; owed_cents: number; retailer: string; at: string; run_id: string } | null;
  generated_at?: string;
};

export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }) : "never");
export const dateOnly = (iso: string) => new Date(iso + (iso.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

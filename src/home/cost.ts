// Cost per receipt. The platform's own meter is the witness (R17): CPU seconds and reserved
// memory byte-seconds come from the Sprites usage API for that one Sprite, priced with Fly's
// published rates (snapshot: evidence/snapshots/fly-pricing.txt, read 2026-11-26).
import { db } from "./db.ts";

export const RATES = {
  cpu_usd_per_cpu_hour: 0.0385,
  mem_usd_per_gb_hour: 0.021875,
  cold_storage_usd_per_gb_month: 0.02,
  source: "https://fly.io/pricing/ (Sprites tab)",
  snapshot: "evidence/snapshots/fly-pricing.txt",
};

const GIB = 1024 ** 3;

export type Priced = { cpu_usd: number; mem_usd: number; storage_usd: number | null; total_usd: number };

export function price(cpu_time_sec: number, mem_byte_sec: number, storage_gb: number | null, days: number): Priced {
  const cpu = (cpu_time_sec / 3600) * RATES.cpu_usd_per_cpu_hour;
  const mem = (mem_byte_sec / GIB / 3600) * RATES.mem_usd_per_gb_hour;
  const storage = storage_gb === null ? null : storage_gb * RATES.cold_storage_usd_per_gb_month * (days / 30);
  return { cpu_usd: cpu, mem_usd: mem, storage_usd: storage, total_usd: cpu + mem + (storage ?? 0) };
}

export function bookCost(sprite: string, u: { cpu_time_sec: number; reserved_memory_byte_sec: number; partial: boolean }, storageGb: number | null, days: number) {
  const p = price(u.cpu_time_sec, u.reserved_memory_byte_sec, storageGb, days);
  db().prepare(
    `INSERT INTO costs (sprite,cpu_sec,mem_byte_sec,partial,fetched_at,cpu_usd,mem_usd,storage_usd,total_usd,days_watched)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(sprite) DO UPDATE SET cpu_sec=excluded.cpu_sec, mem_byte_sec=excluded.mem_byte_sec, partial=excluded.partial,
       fetched_at=excluded.fetched_at, cpu_usd=excluded.cpu_usd, mem_usd=excluded.mem_usd, storage_usd=excluded.storage_usd,
       total_usd=excluded.total_usd, days_watched=excluded.days_watched`,
  ).run(sprite, u.cpu_time_sec, u.reserved_memory_byte_sec, u.partial ? 1 : 0, new Date().toISOString(), p.cpu_usd, p.mem_usd, p.storage_usd, p.total_usd, days);
  return p;
}

export function costSummary() {
  const rows = db().prepare("SELECT * FROM costs").all() as any[];
  const n = rows.length;
  const total = rows.reduce((s, r) => s + r.total_usd, 0);
  const days = rows.reduce((s, r) => s + (r.days_watched ?? 0), 0);
  const claims = (db().prepare("SELECT COUNT(*) c FROM claims").get() as any).c as number;
  return {
    receipts_metered: n,
    total_usd: total,
    per_receipt_usd: n ? total / n : null,
    per_receipt_per_day_usd: days ? total / days : null,
    per_claim_usd: claims ? total / claims : null,
    partial_rows: rows.filter((r) => r.partial).length,
    rates: RATES,
    rows,
  };
}

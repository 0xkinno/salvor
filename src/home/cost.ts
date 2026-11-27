// Cost per receipt. Two sources, always labelled (R17, "the platform's meter is the witness"):
//   "platform meter": cpu_time_sec and reserved_memory_byte_sec from the Sprites usage API, read before the Sprite is deleted.
//   "measured by the Sprite": on the starter credit the meter returned no records at all (FINDINGS Q7), so each wake
//   measures its own CPU time and memory and Salvor prices those at Fly's published rates. It is an estimate from
//   real measurements, and every surface says so.
// Rates: evidence/snapshots/fly-pricing.txt, read 2026-11-26.
import { db } from "./db.ts";

export const RATES = {
  cpu_usd_per_cpu_hour: 0.0385,
  mem_usd_per_gb_hour: 0.021875,
  cold_storage_usd_per_gb_month: 0.02,
  source: "https://fly.io/pricing/ (Sprites tab)",
  snapshot: "evidence/snapshots/fly-pricing.txt",
};

const GIB = 1024 ** 3;
export const SOURCE_METER = "platform meter";
export const SOURCE_SELF = "measured by the Sprite (the platform meter returned no records)";

export type Priced = { cpu_usd: number; mem_usd: number; storage_usd: number | null; total_usd: number };

export function price(cpu_time_sec: number, mem_byte_sec: number, storage_gb: number | null, days: number): Priced {
  const cpu = (cpu_time_sec / 3600) * RATES.cpu_usd_per_cpu_hour;
  const mem = (mem_byte_sec / GIB / 3600) * RATES.mem_usd_per_gb_hour;
  const storage = storage_gb === null ? null : storage_gb * RATES.cold_storage_usd_per_gb_month * (days / 30);
  return { cpu_usd: cpu, mem_usd: mem, storage_usd: storage, total_usd: cpu + mem + (storage ?? 0) };
}

// What the Sprite measured about itself across its wakes.
export function selfMeasured(sprite: string): { cpu_sec: number; mem_byte_sec: number; wakes: number } {
  const rows = db().prepare("SELECT cpu_ms, wall_ms, rss_mb FROM wakes WHERE sprite=? AND ok=1").all(sprite) as { cpu_ms: number | null; wall_ms: number | null; rss_mb: number | null }[];
  let cpu = 0, mem = 0;
  for (const r of rows) { cpu += (r.cpu_ms ?? 0) / 1000; mem += ((r.rss_mb ?? 0) * 1048576) * ((r.wall_ms ?? 0) / 1000); }
  return { cpu_sec: cpu, mem_byte_sec: mem, wakes: rows.length };
}

export function bookCost(
  sprite: string, u: { cpu_time_sec: number; reserved_memory_byte_sec: number; partial: boolean }, storageGb: number | null, days: number,
  meta: { born_at: string; retired_at: string },
) {
  const metered = u.cpu_time_sec > 0 || u.reserved_memory_byte_sec > 0;
  const me = selfMeasured(sprite);
  const cpu = metered ? u.cpu_time_sec : me.cpu_sec, mem = metered ? u.reserved_memory_byte_sec : me.mem_byte_sec;
  const source = metered ? SOURCE_METER : SOURCE_SELF;
  const p = price(cpu, mem, storageGb, days);
  db().prepare(
    `INSERT INTO costs (sprite,cpu_sec,mem_byte_sec,partial,fetched_at,cpu_usd,mem_usd,storage_usd,total_usd,days_watched,source,retired_at,born_at,wakes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(sprite) DO UPDATE SET cpu_sec=excluded.cpu_sec, mem_byte_sec=excluded.mem_byte_sec, partial=excluded.partial, fetched_at=excluded.fetched_at,
       cpu_usd=excluded.cpu_usd, mem_usd=excluded.mem_usd, storage_usd=excluded.storage_usd, total_usd=excluded.total_usd, days_watched=excluded.days_watched,
       source=excluded.source, retired_at=excluded.retired_at, born_at=excluded.born_at, wakes=excluded.wakes`,
  ).run(sprite, cpu, mem, u.partial ? 1 : 0, new Date().toISOString(), p.cpu_usd, p.mem_usd, p.storage_usd, p.total_usd, days, source, meta.retired_at, meta.born_at, me.wakes);
  return { ...p, source };
}

export function costSummary() {
  const rows = db().prepare("SELECT * FROM costs ORDER BY retired_at").all() as any[];
  const n = rows.length;
  const total = rows.reduce((s, r) => s + r.total_usd, 0);
  const days = rows.reduce((s, r) => s + (r.days_watched ?? 0), 0);
  const claims = (db().prepare("SELECT COUNT(*) c FROM claims WHERE approved_at IS NOT NULL").get() as any).c as number;
  return {
    receipts_metered: n,
    total_usd: total,
    per_receipt_usd: n ? total / n : null,
    per_receipt_per_day_usd: days ? total / days : null,
    per_claim_usd: claims ? total / claims : null,
    sources: [...new Set(rows.map((r) => r.source))],
    partial_rows: rows.filter((r) => r.partial).length,
    rates: RATES,
    rows,
  };
}

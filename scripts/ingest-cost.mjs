// P4: writes the retired Sprites' recorded bills (from the live service) into evidence/runs/p4.jsonl, source label included.
//   SALVOR_URL=... node scripts/ingest-cost.mjs
import { writeFileSync } from "node:fs";
const base = process.env.SALVOR_URL; if (!base) { console.error("SALVOR_URL is not set"); process.exit(2); }
const j = await (await fetch(base + "/api/proof")).json();
const rows = (j.cost?.rows ?? []).map((r) => ({ kind: "p4_cost", sprite: r.sprite, total_usd: r.total_usd, days: r.days_watched, partial: Boolean(r.partial), source: r.source, wakes: r.wakes, cpu_sec: r.cpu_sec, retired_at: r.retired_at }));
writeFileSync("evidence/runs/p4.jsonl", rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
console.log(`${rows.length} retired Sprite bills recorded`);

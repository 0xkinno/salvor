// DEV ONLY. Fills a local ledger so the UI can be exercised and screenshotted without live accounts.
// It writes rows marked source "dev-seed". It is never uploaded by deploy-home.mjs and the app
// shows no number from it on the proof page (those come from run files only).
import { rmSync } from "node:fs";
rmSync(".salvor-local/dev.db", { force: true });
process.env.SALVOR_DB = ".salvor-local/dev.db";
const { addReceipt, ingestReport, setSprite } = await import("../src/home/ledger.ts");
const { db } = await import("../src/home/db.ts");

const NOW = new Date();
const iso = NOW.toISOString();
const mk = (id, line, paid, url, date = "2026-11-09") => {
  const r = addReceipt({ id, retailer: "target", channel: "online", purchased_date: date, source: "dev-seed", title: line, lines: [{ raw_text: line, paid_cents: paid, listing_url: url }] });
  setSprite(id, `slv-r-${id.toLowerCase()}`, "watching");
  return r.lineIds[0];
};
const rep = (lid, run, price, same, conf, owedP = 0.9) => ({
  job_id: lid, run_id: run, decision: "observed", observed_at: iso, sabotage: "none", calls: [], checkpoint: "v3", sha256: "3fa1c9d2" + "ab".repeat(28), evidence_day: iso.slice(0, 10),
  listing: { price_cents: price, regular_cents: 12999, seller: "Target", in_stock: true, flags: [], observed_at: iso, title: "Ninja 6 Quart Air Fryer", brand: "Ninja", variant: null, sku: "94285420", url: null },
  read: { same, sameConf: conf, sameProbs: {}, owedP, model: "dev", usage: null, route: "/v1/decisions", ms: 90 },
});
const a = mk("7Q2A", "NINJA AF161 6QT AIR FRYER", 12999, "https://www.target.com/p/ninja-6qt/-/A-94285420");
const b = mk("K9DA", "KITCHENAID 5QT STAND MIXER", 34999, "https://www.target.com/p/mixer/-/A-1000001");
const c = mk("M3FX", "DYSON V8 CORDLESS VAC", 29999, "https://www.target.com/p/dyson/-/A-1000002");
const d = mk("B81C", "LEGO ICONS BOTANICAL SET", 5999, "https://www.target.com/p/lego/-/A-1000003");
const e = mk("T5PW", "CROCKPOT 7QT SLOW COOKER", 4999, "https://www.target.com/p/slow/-/A-1000004");
await ingestReport(a, rep(a, "dev-1", 7999, "exact", 0.97), { now: NOW, draft: null });
await ingestReport(b, rep(b, "dev-2", 34999, "exact", 0.95), { now: NOW, draft: null });
await ingestReport(c, rep(c, "dev-3", 21999, "cannot_tell", 0.42, 0.6), { now: NOW, draft: null });
await ingestReport(d, rep(d, "dev-4", 5999, "exact", 0.9), { now: NOW, draft: null });
console.log("seeded", db().prepare("SELECT COUNT(*) c FROM receipts").get().c, "receipts");

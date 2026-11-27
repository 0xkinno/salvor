// Score the result files produced by ollama-measure.mjs and append one record per model to evidence/runs/ollama.jsonl.
import { readFileSync, appendFileSync } from "node:fs";
const truth = JSON.parse(readFileSync("evidence/samples/truth.json", "utf8"));
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9. ]+/g, " ").split(/\s+/).filter(Boolean);
for (const m of process.argv.slice(2)) {
  const res = JSON.parse(readFileSync(`evidence/samples/result-${m.replace(/[:/]/g, "_")}.json`, "utf8"));
  let store = 0, date = 0, prices = 0, nPrices = 0, lines = 0, nLines = 0, valid = 0, secs = 0;
  for (const [i, t] of truth.entries()) {
    const r = res[i]; secs += r.seconds; let j = null; try { j = JSON.parse(r.reply); valid++; } catch { /* unreadable reply */ }
    if (!j) { nPrices += t.items.length; nLines += t.items.length; continue; }
    if (norm(j.store).join(" ").includes(t.store.toLowerCase())) store++;
    if (String(j.date ?? "").trim() === t.date) date++;
    const got = Array.isArray(j.items) ? j.items : [];
    for (const it of t.items) {
      nPrices++; nLines++;
      if (got.some((g) => Math.round(Number(String(g.price).replace(/[^0-9.]/g, "")) * 100) === it.price_cents)) prices++;
      const want = norm(it.text);
      if (got.some((g) => { const w = new Set(norm(g.text)); return want.filter((x) => w.has(x)).length / want.length >= 0.8; })) lines++;
    }
  }
  const rec = { kind: "ollama_vision", model: m, n_images: truth.length, valid_json: valid, store_correct: store, date_correct: date, prices_correct: prices, prices_total: nPrices, lines_correct: lines, lines_total: nLines, seconds_per_image: Number((secs / truth.length).toFixed(1)), host: "slv-home, 8 CPU, 8 GB, no GPU", measured_at: new Date().toISOString() };
  appendFileSync("evidence/runs/ollama.jsonl", JSON.stringify(rec) + "\n"); console.log(JSON.stringify(rec));
}

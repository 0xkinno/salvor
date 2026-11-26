// P3 data collection. Takes the labelled pairs and runs the match decision inside a receipt Sprite, through the
// gateway to Pinecone: once with Pinecone's rerank score ("full") and once with the same typed rules alone
// ("rules"). The difference is what Pinecone adds. The split is 50/50 by a stable hash of the pair id, so it
// cannot be tuned by hand. Writes p3_pair records.
//   SPRITES_TOKEN=... SALVOR_STUDY_SPRITE=slv-r-xxxx node scripts/p3-run.mjs evidence/labels/pairs.json
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { need, execOn, decodeExec } from "./lib/api.mjs";

need("SPRITES_TOKEN");
const pairs = JSON.parse(readFileSync(process.argv[2] ?? "evidence/labels/pairs.json", "utf8"));
const split = (id) => (parseInt(createHash("sha256").update(id).digest("hex").slice(0, 8), 16) % 2 === 0 ? "tune" : "test");
const eyes = process.env.SALVOR_STUDY_SPRITE ?? "slv-r-3b9f";
const WORKER = "/home/sprite/salvor/receipt-worker.mjs";

mkdirSync("evidence/runs", { recursive: true });
writeFileSync("evidence/runs/p3.jsonl", "");
let n = 0, bad = 0;
for (let i = 0; i < pairs.length; i += 25) {      // batches keep each exec short
  const chunk = pairs.slice(i, i + 25);
  const r = decodeExec((await execOn(eyes, ["node", WORKER, "match-batch"], { stdin: JSON.stringify(chunk.map((p) => ({ id: p.id, line: p.line, listing: p.listing }))) })).buf);
  let res; try { res = JSON.parse(r.stdout.trim().split("\n").pop()); } catch { console.error("batch printed no JSON:", r.stdout.slice(0, 200), r.stderr.slice(0, 200)); process.exit(1); }
  for (const p of chunk) {
    const x = res.find((y) => y.id === p.id);
    if (!x || x.error) { bad++; continue; }
    appendFileSync("evidence/runs/p3.jsonl", JSON.stringify({ kind: "p3_pair", id: p.id, split: split(p.id), origin: p.origin, label: p.label, m_same: x.full.same, m_conf: x.full.conf, r_same: x.rules.same, r_conf: x.rules.conf, rerank: x.rerank }) + "\n");
    n++;
  }
  console.log(`  ${Math.min(i + 25, pairs.length)} of ${pairs.length}`);
}
console.log(`wrote ${n} p3_pair records (${bad} failed). Next: node scripts/tune.mjs, then node scripts/facts.mjs`);

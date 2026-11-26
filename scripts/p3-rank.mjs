// P3b: can Salvor find the right listing for a cryptic receipt line among many candidates? Pinecone's rerank
// against a plain word-overlap baseline, top-1 and top-3. Uses the real listings in evidence/labels/pairs.json
// and the exact lines. Writes p3_rank records to evidence/runs/p3b.jsonl.
//   SPRITES_TOKEN=... SALVOR_STUDY_SPRITE=slv-r-3b9f node scripts/p3-rank.mjs
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { need, execOn, decodeExec } from "./lib/api.mjs";
need("SPRITES_TOKEN");
const pairs = JSON.parse(readFileSync("evidence/labels/pairs.json", "utf8"));
const exact = pairs.filter((p) => p.label === "exact");
const docs = exact.map((p) => ({ id: p.id.replace("-exact", ""), text: [p.listing.brand, p.listing.title].filter(Boolean).join(" ") }));
const lines = exact.map((p) => ({ id: p.id.replace("-exact", ""), line: p.line }));
const eyes = process.env.SALVOR_STUDY_SPRITE ?? "slv-r-3b9f";
const words = (t) => t.toLowerCase().replace(/(\d+(?:\.\d+)?)\s?(quarts?|qt)\b/g, "$1qt").replace(/[^a-z0-9.]+/g, " ").split(" ").filter((w) => w.length > 1);
const lexical = (line) => docs.map((d) => { const dw = new Set(words(d.text)); const lw = words(line); return { id: d.id, s: lw.filter((w) => dw.has(w)).length / lw.length }; }).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
const out = [];
for (let i = 0; i < lines.length; i += 12) {
  const chunk = lines.slice(i, i + 12);
  const r = decodeExec((await execOn(eyes, ["node", "/home/sprite/salvor/receipt-worker.mjs", "rank-batch"], { stdin: JSON.stringify({ lines: chunk, docs }) })).buf);
  try { out.push(...JSON.parse(r.stdout.trim().split("\n").pop())); } catch { console.error("no JSON", r.stdout.slice(0, 160), r.stderr.slice(0, 160)); process.exit(1); }
}
writeFileSync("evidence/runs/p3b.jsonl", "");
let failed = 0;
for (const l of lines) {
  const x = out.find((y) => y.id === l.id);
  if (!x || x.error) { failed++; appendFileSync("evidence/runs/p3b.jsonl", JSON.stringify({ kind: "p3_rank", id: l.id, failed: true }) + "\n"); continue; }
  const lex = lexical(l.line);
  appendFileSync("evidence/runs/p3b.jsonl", JSON.stringify({ kind: "p3_rank", id: l.id, pinecone_top1: x.top[0] === l.id, pinecone_top3: x.top.includes(l.id), lexical_top1: lex[0].id === l.id && lex[0].s > (lex[1]?.s ?? -1), lexical_top3: lex.slice(0, 3).some((y) => y.id === l.id), candidates: docs.length }) + "\n");
}
console.log(`ranked ${lines.length - failed} lines against ${docs.length} candidates (${failed} failed)`);

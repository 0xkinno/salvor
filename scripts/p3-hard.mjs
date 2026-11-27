// P3c: the hard ranking set. 100 receipt-style lines, truncated the way a register prints them (uppercase, no
// punctuation, cut at 24 characters), each ranked against the whole pool of real Target listings read by Apify
// searches (evidence/labels/hard-pool.json). The list is frozen and hashed BEFORE any ranking runs; the hash goes in
// every record. Pinecone rerank against plain word overlap; top-1 and top-3; misses listed by id.
//   node scripts/p3-hard.mjs freeze          writes evidence/labels/hard-set.json and its sha256
//   SPRITES_TOKEN=... node scripts/p3-hard.mjs run
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const pool = JSON.parse(readFileSync("evidence/labels/hard-pool.json", "utf8")).map((l, i) => ({ id: `H${String(i + 1).padStart(3, "0")}`, ...l }));
const text = (l) => [l.brand, l.title].filter(Boolean).join(" ");
const receipt = (t) => t.replace(/[^A-Za-z0-9. ]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase().slice(0, 24).replace(/ \S*$/, (m) => (t.length > 24 ? "" : m)).trim();
let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
if (process.argv[2] === "freeze") {
  // A line that prints identically for two listings has no single right answer, so those are left out and counted.
  const printed = new Map(); for (const p of pool) { const k = receipt(text(p)); printed.set(k, (printed.get(k) ?? 0) + 1); }
  const ids = pool.filter((p) => printed.get(receipt(text(p))) === 1).map((p) => p.id); const ambiguous = pool.length - ids.length; const pick = [];
  const want = Math.min(100, ids.length);
  while (pick.length < want) pick.push(ids.splice(Math.floor(rnd() * ids.length), 1)[0]);
  const lines = pick.sort().map((id) => ({ id, line: receipt(text(pool.find((p) => p.id === id))) }));
  const body = JSON.stringify({ pool: pool.length, left_out_ambiguous: ambiguous, lines }, null, 1);
  writeFileSync("evidence/labels/hard-set.json", body);
  writeFileSync("evidence/labels/hard-set.sha256", createHash("sha256").update(body).digest("hex") + "\n");
  console.log(`frozen ${lines.length} lines against ${pool.length} candidates`, createHash("sha256").update(body).digest("hex"));
  process.exit(0);
}
const { need, execOn, decodeExec } = await import("./lib/api.mjs");
need("SPRITES_TOKEN");
const body = readFileSync("evidence/labels/hard-set.json", "utf8");
const hash = createHash("sha256").update(body).digest("hex");
if (hash !== readFileSync("evidence/labels/hard-set.sha256", "utf8").trim()) { console.error("the frozen set changed after it was hashed"); process.exit(1); }
const { lines } = JSON.parse(body);
const docs = pool.map((p) => ({ id: p.id, text: text(p) }));
const words = (t) => t.toLowerCase().replace(/(\d+(?:\.\d+)?)\s?(quarts?|qt)\b/g, "$1qt").replace(/[^a-z0-9.]+/g, " ").split(" ").filter((w) => w.length > 1);
const lexical = (line) => docs.map((d) => { const dw = new Set(words(d.text)); const lw = words(line); return { id: d.id, s: lw.filter((w) => dw.has(w)).length / (lw.length || 1) }; }).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
const eyes = process.env.SALVOR_STUDY_SPRITE ?? "slv-r-d1e1";
const out = [];
for (let i = 0; i < lines.length; i += 10) {
  const r = decodeExec((await execOn(eyes, ["node", "/home/sprite/salvor/receipt-worker.mjs", "rank-batch"], { stdin: JSON.stringify({ lines: lines.slice(i, i + 10), docs }) })).buf);
  try { out.push(...JSON.parse(r.stdout.trim().split("\n").pop())); } catch { console.error("no JSON", r.stdout.slice(0, 160), r.stderr.slice(0, 160)); process.exit(1); }
}
const file = "evidence/runs/p3c.jsonl"; writeFileSync(file, "");
let failed = 0;
for (const l of lines) {
  const x = out.find((y) => y.id === l.id);
  if (!x || x.error) { failed++; appendFileSync(file, JSON.stringify({ kind: "p3_hard", id: l.id, failed: true, set_sha256: hash }) + "\n"); continue; }
  const lex = lexical(l.line);
  appendFileSync(file, JSON.stringify({ kind: "p3_hard", id: l.id, line: l.line, pinecone_top1: x.top[0] === l.id, pinecone_top3: x.top.slice(0, 3).includes(l.id), lexical_top1: lex[0].id === l.id && lex[0].s > (lex[1]?.s ?? -1), lexical_top3: lex.slice(0, 3).some((y) => y.id === l.id), candidates: docs.length, set_sha256: hash }) + "\n");
}
console.log(`ranked ${lines.length - failed} of ${lines.length} lines against ${docs.length} candidates (${failed} failed)`);

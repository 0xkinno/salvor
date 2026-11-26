// P3 data collection. Takes the labelled pairs and asks Jev (inside a receipt Sprite, through the
// gateway) and a plain LLM prompt (on slv-home, through the Ollama connector) the same question.
// Writes p3_pair records. Split is 50/50 by a stable hash of the pair id, so it cannot be tuned by hand.
//   SPRITES_TOKEN=... node scripts/p3-run.mjs evidence/labels/pairs.json
// pairs.json: [{id, origin:"curated"|"wild", line, listing:{title,brand,variant,sku,seller,in_stock}, label:"exact"|"other_variant"|"other_product"}]
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { need, execOn, decodeExec } from "./lib/api.mjs";

need("SPRITES_TOKEN");
const pairs = JSON.parse(readFileSync(process.argv[2] ?? "evidence/labels/pairs.json", "utf8"));
const split = (id) => (parseInt(createHash("sha256").update(id).digest("hex").slice(0, 8), 16) % 2 === 0 ? "tune" : "test");
const eyes = process.env.SALVOR_STUDY_SPRITE ?? "slv-r-study";
const WORKER = "/home/sprite/salvor/receipt-worker.mjs";

const jev = decodeExec((await execOn(eyes, ["node", WORKER, "jev-batch"], { stdin: JSON.stringify(pairs.map((p) => ({ id: p.id, line: p.line, listing: p.listing }))) })).buf);
let jevRes; try { jevRes = JSON.parse(jev.stdout.trim().split("\n").pop()); } catch { console.error("Jev batch printed no JSON:", jev.stdout.slice(0, 200), jev.stderr.slice(0, 200)); process.exit(1); }

const llmScript = `import { llmSameItem } from "./src/connectors/ollama.ts"; const pairs = JSON.parse(await new Response(process.stdin).text()); const out = []; for (const p of pairs) { try { const r = await llmSameItem({ raw_text: p.line }, p.listing); out.push({ id: p.id, ...r }); } catch (e) { out.push({ id: p.id, error: String(e.message).slice(0, 100) }); } } console.log(JSON.stringify(out));`;
const llm = decodeExec((await execOn("slv-home", ["node", "--input-type=module", "-e", llmScript], { dir: "/home/sprite/salvor", stdin: JSON.stringify(pairs.map((p) => ({ id: p.id, line: p.line, listing: p.listing }))) })).buf);
let llmRes = []; try { llmRes = JSON.parse(llm.stdout.trim().split("\n").pop()); } catch { console.error("LLM baseline printed no JSON; ablation will be missing:", llm.stderr.slice(0, 200)); }

mkdirSync("evidence/runs", { recursive: true });
let n = 0;
for (const p of pairs) {
  const j = jevRes.find((x) => x.id === p.id), l = llmRes.find((x) => x.id === p.id);
  if (!j || j.error) continue;
  appendFileSync("evidence/runs/p3.jsonl", JSON.stringify({ kind: "p3_pair", id: p.id, split: split(p.id), origin: p.origin, label: p.label, jev_same: j.same, jev_conf: j.conf, llm_same: l?.same ?? null, llm_conf: l?.conf ?? 0 }) + "\n");
  n++;
}
console.log(`wrote ${n} of ${pairs.length} p3_pair records. Next: node scripts/tune.mjs, then node scripts/facts.mjs`);

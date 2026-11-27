// Household memory, measured: a receipt line the owner confirmed in an earlier answer is recalled from Pinecone
// when a differently printed line for the same item arrives. Runs on a receipt Sprite through the read connection.
// Records evidence/runs/memory.jsonl. Needs a human-confirmed item (the owner's YES to a question email).
//   node scripts/memory-demo.mjs "<new line text>"
import { appendFileSync } from "node:fs";
import { need, execOn, decodeExec } from "./lib/api.mjs";
need("SPRITES_TOKEN");
const text = process.argv.slice(2).join(" ");
if (!text) { console.error("give a receipt line"); process.exit(2); }
const eyes = process.env.SALVOR_STUDY_SPRITE ?? "slv-r-d1e1";
const r = decodeExec((await execOn(eyes, ["node", "/home/sprite/salvor/receipt-worker.mjs", "recall", text])).buf);
const j = JSON.parse(r.stdout.trim().split("\n").pop());
const rec = { kind: "memory_recall", at: new Date().toISOString(), query: text, recalled: j.recalled, found: Boolean(j.recalled) };
appendFileSync("evidence/runs/memory.jsonl", JSON.stringify(rec) + "\n");
console.log(JSON.stringify(rec, null, 1));

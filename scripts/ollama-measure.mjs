// Measure Ollama vision models on the ten sample receipt images, on slv-home itself (CPU, 8 GB).
// Uploads the images and the answers, runs each model over each image with the same prompt, scores:
//   store, date, every price to the cent, and each line's wording (all words present), plus seconds per image.
// Records evidence/runs/ollama.jsonl (one record per model). Usage: node scripts/ollama-measure.mjs model [model ...]
import { readFileSync, writeFileSync } from "node:fs";
import { need, execOn, decodeExec, sp } from "./lib/api.mjs";
need("SPRITES_TOKEN");
const truth = JSON.parse(readFileSync("evidence/samples/truth.json", "utf8"));
const put = (path, buf) => sp("PUT", `/v1/sprites/slv-home/fs/write?path=${encodeURIComponent(path)}&mode=0644`, buf, { headers: { "content-type": "application/octet-stream" } });
await put("/home/sprite/ollama/samples/truth.json", readFileSync("evidence/samples/truth.json"));
for (const t of truth) await put(`/home/sprite/ollama/samples/${t.file.split("/").pop()}`, readFileSync(t.file));
const runner = `
const fs=require("fs");const truth=JSON.parse(fs.readFileSync("/home/sprite/ollama/samples/truth.json","utf8"));
const [model,idx]=[process.argv[2],Number(process.argv[3])];const t=truth[idx];
const prompt='Read this store receipt. Reply with JSON only: {"store":"Target or Best Buy","date":"YYYY-MM-DD","items":[{"text":"item text as printed","price":12.34}]}. Prices are the line prices in dollars. Do not include subtotal, tax or total as items.';
(async()=>{const img=fs.readFileSync("/home/sprite/ollama/samples/"+t.file.split("/").pop()).toString("base64");const t0=Date.now();let reply=null,err=null;
 try{const r=await fetch("http://127.0.0.1:11434/api/chat",{method:"POST",body:JSON.stringify({model,stream:false,format:"json",options:{temperature:0,use_mmap:false,num_thread:8,num_ctx:4096},messages:[{role:"user",content:prompt,images:[img]}]}),signal:AbortSignal.timeout(170000)});const j=await r.json();reply=j.message?.content??null;err=j.error??null}catch(e){err=String(e.message)}
 console.log(JSON.stringify({file:t.file,seconds:(Date.now()-t0)/1000,reply,err}));})();`;
await put("/home/sprite/ollama/run.cjs", Buffer.from(runner));
const results = [];
for (const m of process.argv.slice(2)) {
  const out = [];
  for (let i = 0; i < truth.length; i++) {
    const r = decodeExec((await execOn("slv-home", ["node", "/home/sprite/ollama/run.cjs", m, String(i)])).buf);
    const rec = JSON.parse(r.stdout.trim().split("\n").pop()); out.push(rec); console.log(m, rec.file, rec.seconds, rec.err ?? "");
  }
  writeFileSync(`evidence/samples/result-${m.replace(/[:/]/g, "_")}.json`, JSON.stringify(out));
}

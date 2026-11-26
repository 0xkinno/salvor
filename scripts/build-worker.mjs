// Bundle the receipt worker into one file with no dependencies. Home writes it into each new
// receipt Sprite through the filesystem API, so the child never needs outside egress to install anything.
import { build } from "esbuild";
import { mkdirSync, statSync } from "node:fs";

mkdirSync("dist", { recursive: true });
await build({
  entryPoints: ["src/receipt/worker.ts"],
  outfile: "dist/receipt-worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  logLevel: "warning",
  banner: { js: "// Salvor receipt worker. Built from src/receipt/worker.ts. MIT, 0xkinno." },
});
console.log(`dist/receipt-worker.mjs ${statSync("dist/receipt-worker.mjs").size} bytes`);

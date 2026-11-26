// Render docs/hero.png (1600x900) from the landing hero, and the four README screenshots, with Playwright.
//   node scripts/shoot-hero.mjs [--base=https://live-url]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");
let base = (process.argv.find((a) => a.startsWith("--base=")) ?? "").slice(7), srv = null;
if (!base) {
  base = "http://127.0.0.1:18092";
  srv = spawn("node", ["src/home/server.ts"], { env: { ...process.env, PORT: "18092", SALVOR_DB: ".salvor-local/dev.db", NODE_NO_WARNINGS: "1" }, stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(base + "/health")).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
}
mkdirSync("docs", { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const shot = async (path, file, wait = 2600) => { await p.goto(base + path, { waitUntil: "networkidle" }); await p.waitForTimeout(wait); await p.screenshot({ path: file }); console.log("wrote", file); };
await shot("/", "docs/hero.png", 3200);
await shot("/app/r/7Q2A", "docs/screens/readme-receipt.png");
await shot("/app", "docs/screens/readme-household.png");
await shot("/proof", "docs/screens/readme-proof.png");
await shot("/fleet", "docs/screens/readme-fleet.png");
await b.close(); srv?.kill();

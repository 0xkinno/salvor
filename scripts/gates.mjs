// UI gates (Playwright Chromium). For every route at five viewports, in normal and reduced motion:
// scroll through first, then check: no horizontal scroll, no overlap between the hero art and any
// text, no overlap between interactive elements, zero console errors, axe WCAG 2.2 AA clean.
// Saves screenshots to docs/screens/. Exit code 1 on any failure.
//   node scripts/gates.mjs [--fast] [--routes=/,/app] [--base=http://localhost:18091]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axeSource = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split("=").slice(1).join("=");
const FAST = process.argv.includes("--fast");
const VIEWS = [["iphone", 390, 844], ["android", 412, 915], ["tablet", 768, 1024], ["laptop", 1280, 800], ["desktop", 1440, 900]];
const ROUTES = arg("routes", "/,/app,/app/r/7Q2A,/try,/fleet,/proof,/how,/judge").split(",");
const BASE = arg("base", "");

let srv = null, base = BASE;
if (!base) {
  const port = 18091; base = `http://127.0.0.1:${port}`;
  srv = spawn("node", ["src/home/server.ts"], { env: { ...process.env, PORT: String(port), SALVOR_DB: ".salvor-local/dev.db", SALVOR_PUBLIC_DEMO: "1", NODE_NO_WARNINGS: "1" }, stdio: "ignore" });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(base + "/health")).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
}
mkdirSync("docs/screens", { recursive: true });
const browser = await chromium.launch();
const failures = [], results = [];
const slug = (r) => (r === "/" ? "home" : r.replace(/^\/|\/$/g, "").replace(/[\/]/g, "-"));

for (const route of ROUTES) {
  for (const [vname, w, h] of VIEWS) {
    for (const reduced of FAST ? [false] : [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? "reduce" : "no-preference", deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(502|503)/.test(m.text())) errors.push(m.text().slice(0, 160)); });
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
      const tag = `${route} ${vname}${reduced ? " reduced" : ""}`;
      const bad = (msg) => { failures.push(`${tag}: ${msg}`); };
      try {
        await page.goto(base + route, { waitUntil: "networkidle", timeout: 30000 });
        // scroll through first so lazy and in-view content is real
        await page.evaluate(async () => { const H = document.body.scrollHeight; for (let y = 0; y < H; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } window.scrollTo(0, 0); });
        await page.waitForTimeout(reduced ? 200 : 2200);
        const m = await page.evaluate(() => {
          const out = { hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, overlaps: [], heroOverlap: [] };
          const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0"; };
          const hit = (a, b) => !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
          const ui = [...document.querySelectorAll("a[href],button,input,select,textarea,[role=button]")].filter(vis).filter((e) => !e.closest("[aria-hidden=true]") && !e.classList.contains("sr-only"));
          const rects = ui.map((e) => [e, e.getBoundingClientRect()]);
          for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
            const [a, ra] = rects[i], [b, rb] = rects[j];
            if (a.contains(b) || b.contains(a)) continue;
            if (hit(ra, rb)) out.overlaps.push(`${(a.textContent || a.tagName).trim().slice(0, 24)} x ${(b.textContent || b.tagName).trim().slice(0, 24)}`);
          }
          const art = document.querySelector("[aria-label^='Example receipt'],[aria-label^='Receipt of']")?.closest("div.relative");
          if (art) {
            const ar = art.getBoundingClientRect();
            const walker = document.createTreeWalker(document.querySelector("section#receipt") ?? document.body, NodeFilter.SHOW_TEXT);
            let n; while ((n = walker.nextNode())) {
              const el = n.parentElement; if (!el || art.contains(el) || !n.textContent.trim() || !vis(el)) continue;
              const r = document.createRange(); r.selectNodeContents(n); for (const rr of r.getClientRects()) if (hit(rr, ar) && rr.width > 4) out.heroOverlap.push(n.textContent.trim().slice(0, 30));
            }
          }
          return out;
        });
        if (m.hscroll) bad("horizontal scroll");
        if (m.overlaps.length) bad(`interactive overlap: ${[...new Set(m.overlaps)].slice(0, 3).join("; ")}`);
        if (m.heroOverlap.length) bad(`hero art overlaps text: ${[...new Set(m.heroOverlap)].slice(0, 3).join("; ")}`);
        await page.evaluate(axeSource);
        const ax = await page.evaluate(async () => { const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(" ").slice(0, 80) })); });
        for (const v of ax) bad(`axe ${v.id} (${v.impact}) x${v.n} e.g. ${v.sample}`);
        if (errors.length) bad(`console errors: ${errors.slice(0, 2).join(" | ")}`);
        if (!reduced) await page.screenshot({ path: `docs/screens/${slug(route)}-${vname}.png`, fullPage: vname === "desktop" || vname === "iphone" });
        results.push({ tag, ok: !failures.some((f) => f.startsWith(tag + ":")) });
      } catch (e) { bad(`crashed: ${String(e.message).slice(0, 140)}`); }
      await ctx.close();
    }
  }
  console.log(`${route}: ${failures.filter((f) => f.startsWith(route + " ")).length} problem(s)`);
}
await browser.close();
srv?.kill();
writeFileSync("docs/screens/gates-report.json", JSON.stringify({ at: new Date().toISOString(), routes: ROUTES, views: VIEWS.map((v) => v[0]), failures, runs: results.length }, null, 2));
console.log(failures.length ? "\n" + failures.join("\n") + `\n\n${failures.length} failure(s)` : `\nall gates pass (${results.length} page runs)`);
process.exit(failures.length ? 1 : 0);

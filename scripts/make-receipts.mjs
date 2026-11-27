// Ten sample receipt images rendered for the Ollama measurement, with the answer for each written alongside.
// Layouts vary (store, font, width, tilt, date format, one to four lines) so the reading is not one template.
//   node scripts/make-receipts.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { writeFileSync } from "node:fs";
const rows = [
  ["Target", "2026-11-12", [["GOURMIA DIGITAL 3QT AIR FRYER", 4999]]],
  ["Target", "2026-11-08", [["LEGO BOTANICALS ROCKING PLANTS", 5999], ["NATURE VALLEY GRANOLA 12CT", 549]]],
  ["Best Buy", "2026-11-15", [["SONY WH-1000XM5 HEADPHONES", 34999]]],
  ["Target", "2026-11-19", [["LEVOIT VORTEXIQ PRO CORDLESS", 19999], ["DAWN DISH SOAP 19OZ", 379], ["SHARPIE 12PK", 899]]],
  ["Best Buy", "2026-11-03", [["APPLE AIRPODS PRO 2", 22900], ["USB-C CABLE 6FT", 1999]]],
  ["Target", "2026-11-21", [["CUISINART FRENCH DOOR AIR FRYER", 15999]]],
  ["Target", "2026-11-10", [["KEURIG K-SUPREME PLUS", 12999], ["FOLGERS COFFEE 30OZ", 1299], ["COFFEE MATE 32OZ", 429], ["PAPER TOWELS 6CT", 1199]]],
  ["Best Buy", "2026-11-17", [["SAMSUNG 55IN CLASS QLED TV", 49999]]],
  ["Target", "2026-11-14", [["INSTANT POT DUO 6QT", 7999], ["OVEN MITT", 1299]]],
  ["Target", "2026-11-05", [["CHEFMAN 1.8L ELECTRIC KETTLE", 3499]]],
];
const fonts = ["Courier New, monospace", "Menlo, Consolas, monospace", "Arial, sans-serif", "Georgia, serif"];
const fmtDate = (d, i) => { const [y, m, dd] = d.split("-"); return [`${m}/${dd}/${y}`, `${m}/${dd}/${y.slice(2)}`, d, `Nov ${Number(dd)}, ${y}`][i % 4]; };
const usd = (c) => (c / 100).toFixed(2);
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 420, height: 700 }, deviceScaleFactor: 2 });
const truth = [];
for (const [i, [store, date, items]] of rows.entries()) {
  const total = items.reduce((s, x) => s + x[1], 0);
  const html = `<body style="margin:0;background:#e9e6df"><div style="width:${300 + (i % 3) * 20}px;margin:20px auto;padding:18px;background:#fff;font:13px/1.5 ${fonts[i % 4]};transform:rotate(${(i % 5 - 2) * 0.6}deg);box-shadow:0 2px 8px #0003">
  <div style="text-align:center;font-weight:700;font-size:17px">${store.toUpperCase()}</div><div style="text-align:center">Store #${1000 + i * 37}</div><div style="text-align:center">${fmtDate(date, i)}  ${10 + i}:${20 + i}</div><hr>
  ${items.map(([t, c]) => `<div style="display:flex;justify-content:space-between"><span>${t}</span><span>${usd(c)}</span></div>`).join("")}<hr>
  <div style="display:flex;justify-content:space-between"><span>SUBTOTAL</span><span>${usd(total)}</span></div><div style="display:flex;justify-content:space-between"><span>TAX</span><span>${usd(Math.round(total * 0.07))}</span></div>
  <div style="display:flex;justify-content:space-between;font-weight:700"><span>TOTAL</span><span>${usd(total + Math.round(total * 0.07))}</span></div><div style="margin-top:8px;text-align:center">THANK YOU</div></div></body>`;
  await pg.setContent(html);
  const f = `evidence/samples/receipt-${String(i + 1).padStart(2, "0")}.png`;
  await pg.locator("div").first().screenshot({ path: f });
  truth.push({ file: f, store, date, items: items.map(([t, c]) => ({ text: t, price_cents: c })) });
}
writeFileSync("evidence/samples/truth.json", JSON.stringify(truth, null, 1));
await b.close(); console.log(`wrote ${truth.length} receipt images`);

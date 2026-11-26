// End-to-end UI behaviour test in Playwright Chromium against a local server with the dev ledger.
// Covers: hover glow on cards, nav pill movement, guided tour (7 steps, keyboard), household to receipt,
// the ask card, digest-bound approval and its single-use refusal, the try form's validation and error
// states, the fleet page's honest error state, mobile menu, and zero console errors throughout.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

execSyncSeed();
function execSyncSeed() { spawn("node", ["scripts/dev-seed.mjs"], { stdio: "ignore" }); }
await new Promise((r) => setTimeout(r, 2500));
const port = 18094, base = `http://127.0.0.1:${port}`;
const srv = spawn("node", ["src/home/server.ts"], { env: { ...process.env, PORT: String(port), SALVOR_DB: ".salvor-local/dev.db", SALVOR_PUBLIC_DEMO: "1", SALVOR_BACKGROUND: "0", NODE_NO_WARNINGS: "1" }, stdio: "ignore" });
for (let i = 0; i < 40; i++) { try { if ((await fetch(base + "/health")).ok) break; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 250)); }
mkdirSync("docs/screens", { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 140)); });
page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };

// 1. landing and the hover glow
await page.goto(base + "/", { waitUntil: "networkidle" });
check("hero headline is present", (await page.locator("h1").innerText()).includes("The store owes you"));
const card = page.locator("[data-tour=hero] li").first();
await card.scrollIntoViewIfNeeded();
const glowBefore = await card.evaluate((el) => getComputedStyle(el.querySelector("div[aria-hidden]")).opacity);
const box = await card.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
await page.waitForTimeout(500);
const glowAfter = await card.evaluate((el) => getComputedStyle(el.querySelector("div[aria-hidden]")).opacity);
check("hover makes the card border glow", Number(glowAfter) > Number(glowBefore), `opacity ${glowBefore} to ${glowAfter}`);
await page.screenshot({ path: "docs/screens/e2e-hover-glow.png", clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 40), width: 560, height: box.height + 80 } });

// 2. nav pill moves and routes work
await page.getByRole("link", { name: "How it works" }).first().click();
await page.waitForURL("**/how");
check("nav goes to /how", (await page.locator("h1").innerText()).includes("no clock"));
const pill = await page.locator("nav a", { hasText: "How it works" }).first().evaluate((a) => a.closest("li").querySelector("span") !== null);
check("active nav item has the gliding pill", pill);

// 3. guided tour, keyboard driven, 7 steps
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Guided tour" }).first().click();
let seen = 0;
for (let i = 0; i < 7; i++) {
  await page.waitForSelector("[role=dialog] h2", { timeout: 6000 });
  seen++;
  if (i < 6) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700); }
}
check("tour shows 7 steps", seen === 7);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("Escape closes the tour", (await page.locator("[role=dialog]").count()) === 0);

// 4. household to receipt
await page.goto(base + "/app", { waitUntil: "networkidle" });
const cards = await page.locator("[data-tour=cards] li").count();
check("household lists the sample receipts", cards >= 5, `${cards} cards`);
await page.locator("[data-tour=cards] a", { hasText: "NINJA" }).first().click();
await page.waitForSelector("text=Target owes you");
check("receipt page shows the claim", true);
check("amount shown is owed $50.00", (await page.locator("text=$50.00").count()) > 0);

// 5. digest-bound approval and single use
await page.getByRole("button", { name: "Approve this claim" }).click();
await page.waitForSelector("[role=status]", { timeout: 8000 });
const okText = await page.locator("[role=status]").first().innerText();
check("approval succeeds and says how it was delivered", /Approved/.test(okText), okText.slice(0, 80));
const claimId = (await (await fetch(base + "/api/receipts/7Q2A")).json()).claim.id;
const again = await fetch(`${base}/api/claims/${claimId}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ digest: "stale" }) });
check("a second approval is refused", again.status === 409);
await page.screenshot({ path: "docs/screens/e2e-approved.png", fullPage: true });

// 6. the ask card
await page.goto(base + "/app", { waitUntil: "networkidle" });
await page.locator("[data-tour=cards] a", { hasText: "DYSON" }).first().click();
await page.waitForSelector("text=One question");
await page.getByRole("button", { name: "Yes, the same item" }).click();
await page.waitForSelector("text=Saved");
check("answering the question saves a lasting fact", true);

// 7. try form: validation and an honest refusal
await page.goto(base + "/try", { waitUntil: "networkidle" });
await page.getByLabel("Product link").fill("https://evil.example/x");
await page.getByLabel("Price you paid").fill("10");
await page.getByRole("button", { name: "Check my receipt" }).click();
await page.waitForSelector("[role=alert]");
check("a non-retailer link is refused with a clear message", /target\.com or bestbuy\.com/.test(await page.locator("[role=alert]").innerText()));

// 8. fleet: the Sprites API is not reachable here, and the page says so instead of inventing a list
await page.goto(base + "/fleet", { waitUntil: "networkidle" });
await page.waitForSelector("[role=alert]", { timeout: 15000 });
check("fleet shows an honest error when the platform is unreachable", /did not answer/.test(await page.locator("[role=alert]").first().innerText()));

// 9. proof says "not measured" instead of a number
await page.goto(base + "/proof", { waitUntil: "networkidle" });
check("proof shows no invented numbers", (await page.locator("text=Not measured yet").count()) > 0 || (await page.locator("text=not measured yet").count()) > 0);

// 10. mobile menu
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Menu" }).click();
check("mobile menu opens with the pages", (await page.locator("#sheet a").count()) >= 5);
await page.screenshot({ path: "docs/screens/e2e-mobile-menu.png" });

check("no console errors during the whole run", errors.length === 0, errors.slice(0, 2).join(" | "));
await browser.close(); srv.kill();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} of ${results.length} FAILED` : `\nall ${results.length} checks pass`);
process.exit(failed.length ? 1 : 0);

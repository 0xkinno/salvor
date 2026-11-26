// House-style and hygiene check for everything that is committed. Fails CI on:
//   - em dashes, en dashes, emoji, hype words in prose and UI copy
//   - the words the owner banned from README, UI and video copy (fictional, fiction, ...)
//   - any other entry's name outside reference/ (checked by hash, so this file lists no names)
//   - attribution to an AI assistant in committed text
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { extname } from "node:path";

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const TEXT = new Set([".md", ".ts", ".tsx", ".mjs", ".js", ".json", ".html", ".css", ".yml", ".yaml", ".txt", ".svg", ""]);
const SKIP = [/^evidence\/snapshots\//, /^evidence\/runs\//, /^package-lock\.json$/, /^web\/package-lock\.json$/, /lane-hashes\.json$/, /^web\/public\/fonts\//, /\.png$/, /\.woff2?$/, /^evidence\/labels\//];
const UI_OR_README = (f) => f === "README.md" || f.startsWith("web/src/") || f === "web/index.html" || f.startsWith("docs/video") || f === "docs/FACTS.json";
const EM = "—", EN = "–";
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
const HYPE = ["revolutionary", "game-changing", "seamless", "cutting-edge", "unleash", "supercharge", "next-level", "world-class", "best-in-class", "groundbreaking", "synergy", "delve", "tapestry", "unlock the power", "effortless", "magical"];
const NARRATIVE = ["fictional", "fiction", "fictitious", "imaginary", "made-up", "made up", "pretend", "fake"];
const HASHES = new Set(JSON.parse(readFileSync("scripts/lane-hashes.json", "utf8")));
const AI = /co-authored-by:.*(claude|anthropic)|claude-session:|generated with.*claude code/i;
// This file and the house-style filter define the word lists, so they are exempt from the word checks.
const SELF = new Set(["scripts/check-copy.mjs", "src/house/style.ts", "test/house.test.ts"]);

let bad = 0;
const fail = (f, line, msg) => { console.log(`${f}:${line}: ${msg}`); bad++; };
const sha = (s) => createHash("sha256").update(s).digest("hex");

for (const f of files) {
  if (SKIP.some((r) => r.test(f)) || !TEXT.has(extname(f)) || !existsSync(f)) continue;
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  lines.forEach((ln, i) => {
    const n = i + 1, low = ln.toLowerCase();
    if (!SELF.has(f)) {
      if (ln.includes(EM)) fail(f, n, "em dash");
      if (ln.includes(EN)) fail(f, n, "en dash");
      if (EMOJI.test(ln)) fail(f, n, "emoji");
      if (/\.(md|html)$/.test(f) || f.startsWith("web/src/")) for (const w of HYPE) if (new RegExp(`\\b${w}\\b`, "i").test(low)) fail(f, n, `hype word "${w}"`);
      if (UI_OR_README(f)) for (const w of NARRATIVE) if (new RegExp(`\\b${w}\\b`, "i").test(low)) fail(f, n, `banned word "${w}" in README, UI or video copy`);
      if (AI.test(ln) && f !== ".github/workflows/no-claude-attribution.yml" && f !== ".githooks/commit-msg") fail(f, n, "AI attribution text");
    }
    // other entries' names, by hash: words and adjacent word pairs
    const toks = low.match(/[a-z0-9][a-z0-9-]*/g) ?? [];
    for (let t = 0; t < toks.length; t++) {
      if (HASHES.has(sha(toks[t]))) fail(f, n, "another entry's name appears outside reference/");
      if (t + 1 < toks.length && HASHES.has(sha(`${toks[t]} ${toks[t + 1]}`))) fail(f, n, "another entry's name appears outside reference/");
    }
  });
}
// Optional stronger check when the reference folder is present.
if (existsSync("reference/LANE_MAP.md")) { /* names are hashed above; the folder itself is gitignored */ }
console.log(bad ? `\ncheck-copy: ${bad} problem(s)` : "check-copy: clean");
process.exit(bad ? 1 : 0);

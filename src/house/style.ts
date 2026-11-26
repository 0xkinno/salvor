// House style filter. Applied to every piece of model output before a person sees it, and to
// UI copy by scripts/check-copy.mjs in CI. Two jobs:
//   1. plain words: no dashes used as punctuation, no emoji, no hype words
//   2. money integrity: every amount in model text must exist in the ledger
import { fmt } from "../policy/money.ts";

export const HYPE_WORDS = [
  "revolutionary", "game-changing", "game changing", "seamless", "cutting-edge", "cutting edge", "unleash",
  "supercharge", "next-level", "next level", "world-class", "best-in-class", "groundbreaking", "leverage",
  "synergy", "delve", "tapestry", "unlock the power", "effortless", "magical",
];

// Words the owner does not want in README, UI copy or the video.
export const NARRATIVE_WORDS = ["fictional", "fiction", "fictitious", "imaginary", "made-up", "made up", "pretend", "fake"];

const EM = "—";
const EN = "–";
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

export type StyleIssue = { rule: string; detail: string };

export function styleIssues(text: string): StyleIssue[] {
  const out: StyleIssue[] = [];
  if (text.includes(EM)) out.push({ rule: "em-dash", detail: "contains an em dash" });
  if (text.includes(EN)) out.push({ rule: "en-dash", detail: "contains an en dash" });
  if (EMOJI.test(text)) out.push({ rule: "emoji", detail: "contains an emoji" });
  const lower = text.toLowerCase();
  for (const w of HYPE_WORDS) if (new RegExp(`\\b${w.replace(/[-]/g, "[- ]")}\\b`, "i").test(lower)) out.push({ rule: "hype", detail: w });
  return out;
}

// Pull every dollar amount out of text, as integer cents.
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const whole = Number(m[1].replace(/,/g, ""));
    const frac = Number(((m[2] ?? "") + "00").slice(0, 2));
    out.push(whole * 100 + frac);
  }
  return out;
}

export type Screened = { ok: true; text: string } | { ok: false; reasons: string[] };

// A model draft is rejected when it states an amount that is not in the allowed set, or
// breaks the house style. The caller then uses the labelled template instead.
export function screenModelText(text: string, allowedCents: number[]): Screened {
  const reasons: string[] = [];
  const cleaned = text.replaceAll(EM, ", ").replaceAll(EN, " to ").trim();
  const allowed = new Set(allowedCents);
  for (const a of amountsIn(cleaned)) if (!allowed.has(a)) reasons.push(`amount ${fmt(a)} is not in the ledger`);
  for (const i of styleIssues(cleaned)) reasons.push(`${i.rule}: ${i.detail}`);
  return reasons.length ? { ok: false, reasons } : { ok: true, text: cleaned };
}

export function scrubUiCopy(text: string): string {
  return text.replaceAll(EM, ", ").replaceAll(EN, " to ");
}

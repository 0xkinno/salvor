// Evidence inside a receipt Sprite: write the day's file, hash it, checkpoint the disk, and say
// which checkpoint holds it. The claim cites checkpoint_id + sha256; slv-home later re-reads the
// file from the platform's read-only mount and compares.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

export const DIR = process.env.SALVOR_DIR ?? "/home/sprite/salvor";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function writeEvidence(day: string, evidence: object): { path: string; text: string; sha256: string } {
  mkdirSync(`${DIR}/evidence`, { recursive: true });
  const path = `${DIR}/evidence/${day}.json`;
  const text = JSON.stringify(evidence, null, 2);
  writeFileSync(path, text);
  return { path, text, sha256: sha256(text) };
}

// "sprite-env checkpoints create --comment ..." prints the new id (v0, v1, ...). Q4 records the
// exact output; until then the id is read with a pattern and an unreadable output is reported.
export function checkpoint(comment: string): { id: string | null; raw: string; ms: number } {
  const t0 = Date.now();
  if (process.env.SALVOR_NO_CHECKPOINT === "1") return { id: null, raw: "checkpoints disabled for this run", ms: 0 };
  const raw = execFileSync("sprite-env", ["checkpoints", "create", "--comment", comment.slice(0, 200)], { encoding: "utf8", timeout: 60_000 });
  const ids = [...raw.matchAll(/\bv\d+\b/g)].map((m) => m[0]);
  return { id: ids.length ? ids[ids.length - 1] : null, raw: raw.slice(0, 400), ms: Date.now() - t0 };
}

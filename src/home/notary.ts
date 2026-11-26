// Checkpoints as evidence. A claim cites checkpoint_id + sha256. Verification asks the platform for its
// own copy of the file. Two ways, highest rung first (FINDINGS Q4):
//   1. mount: read /.sprite/checkpoints/<id>/... inside the Sprite. Fly's docs promise this read-only
//      mount, but on 2026-11-26 the directory stayed empty after a checkpoint, so it is tried and not relied on.
//   2. restore round trip: read the live file, take a safety checkpoint, restore the cited checkpoint, read
//      the file, restore the safety checkpoint. The live state comes back unchanged. About four seconds.
// In both, a witness is also read from the platform's checkpoint list: its comment carries the evidence hash
// and the platform stamps its creation time.
import { createHash } from "node:crypto";
import { exec, checkpoint, restore, listCheckpoints } from "../connectors/sprites.ts";

const DIR = "/home/sprite/salvor/evidence";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const busy = new Set<string>();

export type Verification = {
  ok: boolean;
  method: "mount" | "restore-round-trip";
  checkpoint: string;
  day: string;
  expected_sha256: string;
  mount_sha256: string | null;          // the platform's copy of the file
  live_sha256: string | null;
  live_matches_mount: boolean | null;
  witness: { found: boolean; comment_has_hash: boolean; created_at: string | null };
  mount_path: string;
  why: string;
  ms: number;
};

async function witness(sprite: string, id: string, expected: string): Promise<Verification["witness"]> {
  try {
    const row = (await listCheckpoints(sprite)).find((c: any) => c.id === id);
    if (!row) return { found: false, comment_has_hash: false, created_at: null };
    return { found: true, comment_has_hash: String(row.comment ?? "").includes(expected), created_at: row.create_time ?? row.created_at ?? null };
  } catch { return { found: false, comment_has_hash: false, created_at: null }; }
}

async function readFile(sprite: string, path: string): Promise<string | null> {
  const r = await exec(sprite, ["cat", path]).catch(() => null);
  return r && r.code === 0 ? r.stdout : null;
}

async function waitFor(sprite: string, path: string, want: (t: string | null) => boolean, tries = 40): Promise<string | null> {
  let last: string | null = null;
  for (let i = 0; i < tries; i++) {
    last = await readFile(sprite, path);
    if (want(last)) return last;
    await sleep(500);
  }
  return last;
}

export async function verifyEvidence(spriteName: string, cp: string, day: string, expectedSha: string): Promise<Verification> {
  const t0 = Date.now();
  if (!/^v\d+$/.test(cp) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^slv-[a-z0-9-]+$/.test(spriteName)) throw new Error("bad verification arguments");
  if (busy.has(spriteName)) throw new Error("this Sprite is being verified right now; try again in a few seconds");
  busy.add(spriteName);
  const file = `${DIR}/${day}.json`;
  const mountPath = `/.sprite/checkpoints/${cp}${file}`;
  const base = { checkpoint: cp, day, expected_sha256: expectedSha, mount_path: mountPath };
  try {
    const w = await witness(spriteName, cp, expectedSha);
    const liveText = await readFile(spriteName, file);
    const liveSha = liveText === null ? null : sha(liveText);

    // rung 1: the documented read-only mount
    const mounted = await readFile(spriteName, mountPath);
    let method: Verification["method"] = "mount";
    let copy: string | null = mounted;
    if (mounted === null) {
      // rung 2: restore round trip
      method = "restore-round-trip";
      const safety = await checkpoint(spriteName, `verify-safety ${new Date().toISOString()}`);
      if (!safety.id) throw new Error("could not take a safety checkpoint, so the round trip was not attempted");
      try {
        await restore(spriteName, cp);
        copy = await waitFor(spriteName, file, (t) => t !== null && (liveText === null || t !== liveText), liveText === null ? 40 : 12);
        if (copy === null) copy = null;
      } finally {
        await restore(spriteName, safety.id).catch(() => {});
        await waitFor(spriteName, file, (t) => liveText === null || t === liveText, 40);
      }
    }
    const copySha = copy === null ? null : sha(copy);
    const ok = copySha === expectedSha;
    const changed = liveSha !== null && copySha !== null && liveSha !== copySha;
    return {
      ...base, ok, method, mount_sha256: copySha, live_sha256: liveSha, live_matches_mount: liveSha === null || copySha === null ? null : liveSha === copySha, witness: w,
      why: copySha === null
        ? "The platform's copy could not be read."
        : ok
          ? changed ? "The platform's copy matches the claim. The live file was changed after the checkpoint, and that change is ignored." : "The platform's copy matches the claim."
          : "The platform's copy does NOT match the hash on the claim.",
      ms: Date.now() - t0,
    };
  } finally { busy.delete(spriteName); }
}

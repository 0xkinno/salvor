// Checkpoints as evidence. A claim cites checkpoint_id + sha256. To verify, read the file from the
// platform's read-only checkpoint mount inside the receipt Sprite, hash it, and compare. The live
// file may have been edited since; the mount keeps the original.
import { createHash } from "node:crypto";
import { exec } from "../connectors/sprites.ts";

const DIR = "/home/sprite/salvor/evidence";

export type Verification = {
  ok: boolean;
  checkpoint: string;
  day: string;
  expected_sha256: string;
  mount_sha256: string | null;
  live_sha256: string | null;
  live_matches_mount: boolean | null;
  mount_path: string;
  why: string;
  ms: number;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function verifyEvidence(sprite: string, checkpoint: string, day: string, expectedSha: string): Promise<Verification> {
  const t0 = Date.now();
  if (!/^v\d+$/.test(checkpoint) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^slv-[a-z0-9-]+$/.test(sprite)) throw new Error("bad verification arguments");
  const mountPath = `/.sprite/checkpoints/${checkpoint}${DIR}/${day}.json`;
  const base = { checkpoint, day, expected_sha256: expectedSha, mount_path: mountPath };
  const mounted = await exec(sprite, ["cat", mountPath]);
  if (mounted.code !== 0) {
    return { ...base, ok: false, mount_sha256: null, live_sha256: null, live_matches_mount: null, why: "The checkpoint is not mounted (only the last five are). Restore it to read it.", ms: Date.now() - t0 };
  }
  const mountSha = sha(mounted.stdout);
  const live = await exec(sprite, ["cat", `${DIR}/${day}.json`]);
  const liveSha = live.code === 0 ? sha(live.stdout) : null;
  const ok = mountSha === expectedSha;
  return {
    ...base, ok, mount_sha256: mountSha, live_sha256: liveSha, live_matches_mount: liveSha === null ? null : liveSha === mountSha,
    why: ok
      ? liveSha !== null && liveSha !== mountSha
        ? "The platform's copy matches the claim. The live file was changed after the checkpoint, and that change is ignored."
        : "The platform's copy matches the claim."
      : "The platform's copy does NOT match the hash on the claim.",
    ms: Date.now() - t0,
  };
}

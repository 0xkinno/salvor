# PROOF.md

The proof is the `/proof` page and `docs/FACTS.json`. This file is the index of how to reproduce each part.

| Study | Reproduce | Output |
|---|---|---|
| P1 early buyer | `APIFY_TOKEN=... node scripts/study.mjs` then `node scripts/facts.mjs` | `evidence/runs/p1.jsonl` |
| P2 unattended watch | `node scripts/setup-apify.mjs` (schedule and webhook), wake records land in `evidence/runs/watch.jsonl` | runs completed, drops seen |
| P3 decision quality | `node scripts/p3-run.mjs`, `node scripts/tune.mjs`, `node scripts/facts.mjs` | `evidence/runs/p3.jsonl` |
| P4 cost | automatic when a receipt Sprite is retired (`src/home/fleet.ts#retire`) | `costs` table, `p4_cost` records |
| P5 break campaign | `node scripts/break.mjs` (runs cases a to f on the live Sprites) | `evidence/runs/p5.jsonl` |
| P6 your own receipt | `/try` | latency shown live |

Verify a claim from a terminal: `node scripts/verify-claim.mjs <base url> <claim id>`.

Status on 2026-11-26: none of these have run on the platform yet; they need the accounts listed in `PROGRESS.md`. The page
says "not measured yet" instead of showing a number, and the README block says there are no run files.

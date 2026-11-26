# SPONSOR_INTEL.md

Read on 2026-11-26. Sources are saved under `evidence/snapshots/`. Ladder per partner: shallow (what most entries
do), deep (what Salvor does), newest (the most recent kit and where we use it).

## Fly Sprites
- Sources: `fly-llms.txt`, `fly-connectors.txt`, `fly-checkpoints.txt`, `fly-networking.txt`, `fly-services.txt`, `fly-lifecycle.txt`, `fly-openapi.json`, `fly-pricing.txt`, `fly-api-*.txt`.
- Shallow: run one app on one Sprite and call a connector.
- Deep: many long-lived Sprites, one per receipt, born with a permission and an egress rule, woken by exec, checkpointed per observation, read back through the read-only mount, deleted at window close with the usage meter read first (`src/home/fleet.ts`).
- Newest: Connectors API (create a custom API connector programmatically, access policy with `sprite_labels`, `name_prefix`, `allowed_endpoints`, `blocked_endpoints`), community connectors repository, the usage API that keeps deleted Sprites.
- Facts that shaped the code: path patterns are exact or trailing `*` only; block rules win; a connector with no policy refuses every Sprite; gateway calls must come from inside a running Sprite; the usage API reports `cpu_time_sec` and `reserved_memory_byte_sec` with a `partial` flag; labels are set by the CLI and are not in the documented REST surface.

## TypeSafe Jev
- Sources: `typesafe-home.txt`, `jev-aimlapi.txt`.
- Words: "System One Models are a new class of AI model built for decisions inside software." "Reinforcement Learning for Calibrated Decisions."
- Shallow: classify a category and ignore the confidence.
- Deep: a `choice` question for the item match and a `noul` question for clause eligibility, a threshold chosen on a tune split, a held-out test, both error directions, and an ablation against a plain LLM prompt (`src/connectors/jev.ts`, `scripts/tune.mjs`).
- Newest: Jev 1.14 (floating id `typesafe/jev`). Response shape documented in `jev-aimlapi.txt`. The first-party route is probed (Q9).

## Apify
- Sources: `apify-llms.txt`, `apify-run-sync.txt`.
- Shallow: one actor run on demand.
- Deep: a saved task over a frozen watch list, a schedule every six hours, a webhook that knocks home, `run-sync-get-dataset-items` for search and the judge path, and the run record as part of the evidence (`scripts/setup-apify.mjs`, `src/connectors/apify.ts`).
- Newest: the Apify connector on Sprites ("Run Apify Actors and read their outputs with a saved token").

## Pinecone
- Source: `pinecone-llms.txt`.
- Shallow: store vectors.
- Deep: integrated inference `embed` and `rerank` to map a receipt line to a listing, and a household index written only by home after a human confirmation (`src/connectors/pinecone.ts`).

## Ollama Cloud
- Source: `ollama-cloud.txt`.
- Shallow: one chat call.
- Deep: vision for receipt photos, schema-constrained JSON for lines, text for claim words, with every amount screened against the ledger (`src/connectors/ollama.ts`, `src/house/style.ts`).

## Box
- Source: `box-upload.txt`.
- Shallow: write a file.
- Deep: an intake folder the user already uses, a per-claim output folder, a shared link used inside the claim, status written back to the dropped file (`src/connectors/box.ts`, `src/home/deliver.ts`).
- Open question Q10: upload host differs from the API host; the gateway behaviour is probed.

## AgentMail
- Source: `agentmail-docs.txt`.
- Deep: forward an order email to the inbox, read it with Ollama, send the claim to the owner's test inbox only (`src/connectors/mail.ts`).

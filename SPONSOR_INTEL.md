# SPONSOR_INTEL.md

Read on 2026-11-26. Sources are saved under `evidence/snapshots/`. Ladder per partner: shallow (what most entries do),
deep (what Salvor does), newest (the most recent kit and where it is used).

## Fly Sprites
- Sources: `fly-llms.txt`, `fly-connectors.txt`, `fly-checkpoints.txt`, `fly-networking.txt`, `fly-services.txt`, `fly-lifecycle.txt`, `fly-openapi.json`, `fly-pricing.txt`, `fly-api-*.txt`.
- Shallow: run one app on one Sprite and call a connector.
- Deep: many long-lived Sprites, one per receipt, born with a label and an egress rule, woken by exec, checkpointed per observation, verified through the platform's own copy, deleted at window close with the usage meter read first (`src/home/fleet.ts`, `src/home/notary.ts`).
- Newest: the Connectors API (create connectors programmatically, access policy with `sprite_labels`, `name_prefix`, `allowed_endpoints`), labels set through `PUT /v1/sprites/{name}`, the usage API.
- Facts that shaped the code (all checked on the real account, FINDINGS): a connector may not point at the Sprites API; the checkpoint mount stays empty; usage for a deleted Sprite is a 404; path patterns are exact or trailing `*` only.

## Apify
- Sources: `apify-llms.txt`, `apify-run-sync.txt`.
- Shallow: one actor run on demand.
- Deep: a saved task over a frozen watch list, a schedule every six hours, a webhook that knocks home, dataset reads from inside receipt Sprites through the gateway, and the run record as part of the evidence (`scripts/setup-apify.mjs`, `scripts/ingest-watch.mjs`, `src/connectors/apify.ts`).
- Measured: `apify/e-commerce-scraping-tool` reads price and title for Target pages at about $0.0075 a page; seller, regular price and availability do not come back.

## Pinecone
- Source: `pinecone-llms.txt`.
- Shallow: store vectors.
- Deep: integrated inference `embed` and `rerank` give the evidence behind each match and rank the right listing for a cryptic line; a household index is written only by home after a human answer (`src/connectors/pinecone.ts`, `scripts/p3-rank.mjs`).

## AgentMail
- Source: `agentmail-docs.txt`.
- Deep: a receipts inbox; forwarded order confirmations become receipts by rules; a question or a ready claim is emailed to the owner; a reply of YES, NO or STORE becomes a lasting fact; the approved claim is sent to the owner's own address. Only mail from the owner's address is trusted (`src/connectors/mail.ts`, `src/home/intake.ts`, `src/home/deliver.ts`).

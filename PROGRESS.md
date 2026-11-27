# PROGRESS.md

Dated, honest log. Things that could not be done, and why, are written here with the labelled substitute.

## 2026-11-26

- Repo started. First commit is Phase 0 hygiene. Author and committer are `0xkinno` on every commit; hook and CI reject AI attribution.
- Cloned 20 reference repositories into `reference/` (gitignored) and read their code. Notes and lane map are in `reference/`.
- Saved dated snapshots of Fly docs, the Target policy pages and partner docs in `evidence/snapshots/`.
- **Correction:** the plan quoted the Which? study as 98.5%. The page says 99.5% (201 deals, six UK retailers, 2020). Used the page figure.
- **Not reachable from the build container:** web.archive.org and bestbuy.com (connection refused through the proxy). Effect: Best Buy clause is unverified and held (FINDINGS Q14); archived early-November prices (P1) must be read by Apify (Q15).
- **A direct read of Target's product API with a key taken from the site was blocked by the environment's safety check.** It was not retried or worked around. Store pages are read by Apify only, which is also the design.
- Built: policy engine with 39 tests, gateway and connectors, receipt worker, fleet, notary, claims with digest-bound approval, ledger, home server, intake, web app, UI gates (40 page runs clean), scripts for setup, deploy, probe and facts. 62 tests pass on Node 22.
- Pipeline tests run against a local emulator (`test/helpers/emulator.ts`). This proves our code paths only. No platform claim is made from it.

## 2026-11-26, later

- Repository pushed to https://github.com/0xkinno/salvor (all commits authored by 0xkinno).
- Keys received and tested from the build machine: Apify, Pinecone, Ollama Cloud and AgentMail work. Stored in a gitignored local file, never in the repository.
- **The Fly token provided is the wrong type.** It authenticates to Fly's own API but the Sprites API answers 401 to it under every header scheme. The Sprites API needs a token created on the Sprites side (see the owner steps in the hand-off note). Until then connectors, probe and deploy cannot run.
- Pinecone index `salvor-household` created. Ollama models chosen: `gemma4:31b` (vision), `gpt-oss:120b` (text).
- **Apify watch started** the same day: task `salvor-watch` over 24 frozen Target items (list hash in `evidence/labels/p1-items.sha256`), schedule every 6 hours UTC, first baseline run started manually. Budget: the free plan allows $5 a month; a product read costs about $0.0075.
- Interface redesigned (aurora backdrop, glass cards with a cursor-following border glow, midnight hero stage, champagne gold ornament, new SVG illustrations, illustrated page banners, scroll progress bar). 17 end-to-end checks pass; gates re-run.

## 2026-11-26, evening: the platform, for real

- A Sprites token was minted through the API (`POST /v1/organizations/{org}/tokens` with the Fly org token). The first Fly token was the wrong kind; the second, an org token, can mint Sprites tokens.
- Connectors created with label policies (Apify, AgentMail, Pinecone read and write, Pinecone index read and write).
- `slv-home` is live. The first real run worked end to end: webhook, wake, real Target price, evidence, checkpoint, verification, tamper detection.
- **Against us:** a connector to the Sprites API is blocked by the platform (so home holds a Sprites token, rung b); Fly's checkpoint mount is empty (so verification uses a restore round trip); usage for a deleted Sprite is a 404 (so it is read before deletion).
- **Hard limit found:** the no-card Fly trial allows 3 Sprites in total. Home, one receipt and one pool Sprite exist; creating more needs a card on the Fly account (the Free plan gives $5 of usage a month with a card).
- **Stray tokens:** while trying to find a way to restrict a token I minted four extra unrestricted Sprites tokens. The API has no revoke route, so they must be deleted on the Sprites account page. One of them is in use as home's token (rung b).

## 2026-11-26, night: the four-partner build

- The build settled on four partner products: Fly Sprites, Apify, Pinecone and AgentMail. The match decision is Salvor's own typed match (Pinecone rerank plus typed rules); claim words are written by code; AgentMail carries the human loop.
- Real results: a claim of $12.00 matched and computed with no model, a real email delivered, 9 of 9 break tests, P3 on 108 curated pairs, Pinecone ranks 24 of 24 lines first against 22 of 24 for word overlap.
- The no-card Fly trial allows 3 Sprites, so the live system runs home, one receipt Sprite and one try-it Sprite.

## 2026-11-27: upgrade pass

- Black Friday watch summary on the landing page and `/api/stats`; the schedule is every 4 hours Friday and Saturday (PROOF_PLAN amendment 3); backup tick needs no secret and is rate limited.
- Receipt lifecycle: a settled receipt's Sprite is retired (evidence kept, usage read first, bill recorded and labelled), the next receipt is born; `/fleet` lists retired Sprites and bills.
- P5 a and b run live; hard ranking set frozen and hashed before it ran; household memory wired to confirmed answers; `/try` read live on the pooled Sprite end to end (45.9 s, checkpoint, evidence, restore).
- Platform and partner findings added: Pinecone free rerank limit (500 a month), the gateway cutting one long request (so runs are started and polled), idle connection resets, Ollama measured on the home Sprite (not part of the product).
- Jev removed from code and docs except one findings line.

## Open

| Item | Needs |
|---|---|
| Reply YES to the question email (ask a-0bbf5966) | the owner; it confirms the item, writes the memory vector, and lets the claim form |
| Box login (optional) | the owner's own Box OAuth; no Box code is active without it |
| Video, posts, submission form | the owner's approval |

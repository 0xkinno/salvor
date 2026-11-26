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

## Open, needs accounts

| Item | Needs |
|---|---|
| Create `0xkinno/salvor`, push | a GitHub repository and a push credential |
| Connectors, probe, deploy, `slv-home` | `SPRITES_TOKEN` |
| Real readings, schedule, webhook | `APIFY_TOKEN` |
| Jev, Pinecone, Ollama, AgentMail | their API keys |
| Box | one OAuth click from the owner |
| Real labels (P3) | the owner labels about 200 pairs with the codebook |
| Video, posts, submission form | owner approval (rule 3) |

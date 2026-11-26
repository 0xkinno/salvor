# TASK.md

Every task is ticked `[x]` only when it is done and verified. Run records are in `evidence/runs/`; the numbers in the
README come from `docs/FACTS.json`.

## Phase 0. Ground
- [x] Repository `0xkinno/salvor`, commit hooks, CI attribution guard, MIT licence, `.gitignore`
- [x] Reference study kept out of the repository (`reference/`, ignored)
- [x] `RULES_EXTRACT.md`, `JUDGE_TASTE.md`, `SPONSOR_INTEL.md`, `MOMENT.md` with dated snapshots in `evidence/snapshots/`
- [x] `FINDINGS.md` questions pre-registered before probing (6792274)

## Phase 1. The platform, for real
- [x] Connectors created with label policies (Apify, AgentMail, Pinecone read and write, Pinecone index read and write)
- [x] `slv-home` live at https://slv-home-b6y6f.sprites.app with its service, secrets and the Apify webhook
- [x] `scripts/probe.mjs` run on the real account; answers recorded in `FINDINGS.md` and `PLATFORM_PROBE.md`
- [x] Apify actor chosen by measured completeness (`apify/e-commerce-scraping-tool`)

## Phase 2. The mechanism
- [x] Gateway with durable call counters; `/api/status` measured
- [x] A receipt Sprite is born labelled, network-locked, with its worker and a newborn checkpoint (649 ms)
- [x] Observation on a real Target item: Apify dataset, Pinecone match, evidence, checkpoint, report
- [x] Verification through the platform's own copy (restore round trip), tamper detected

## Phase 3. The decision and the money
- [x] Target clauses from snapshots, 39 policy tests, Best Buy held until its policy is verified
- [x] `src/match.ts`: Pinecone rerank plus typed rules; a different size is always a different variant
- [x] Threshold chosen on the tune split only, never below 0.90 (`scripts/tune.mjs`); measured on a held-out split
- [x] Digest-bound, single-use approval; claim amounts from code only

## Phase 4. Intake and the human loop (AgentMail)
- [x] Forwarded order emails parsed by rules into receipts (`src/home/intake.ts`, unit tests)
- [x] Question and claim-ready emails to the owner; `YES`, `NO`, `STORE` replies become lasting facts
- [x] Approved claim emailed to the owner's inbox; real delivery confirmed
- [x] House screen on all claim text; claim words written by code

## Phase 5. The clock
- [x] Apify task and 6-hour schedule over 24 frozen Target items; webhook to `slv-home`
- [x] Webhook handler: secret, idempotent by run id, wakes receipt Sprites
- [x] Backup tick workflow (needs the two repository secrets to run)
- [ ] First scheduled (unattended) run ingested into `evidence/runs/watch.jsonl`: `node scripts/ingest-watch.mjs` after the 18:00 UTC run

## Phase 6. Proof
- [x] `PROOF_PLAN.md` committed before any result, with two dated amendments
- [x] P3 curated: 108 pairs from real listings, matcher revisions recorded with earlier runs archived
- [x] P3b: Pinecone against word overlap, 24 lines against 24 real candidates
- [x] P5 break tests c, d, e, f on real Sprites (9 of 9)
- [ ] P1 results: needs more scheduled readings after Nov 26
- [ ] P4 cost per receipt: needs a retired receipt Sprite metered
- [ ] P5 a and b (poisoned page and variant swap on the live service)

## Phase 7. Interface
- [x] Design system, fonts, mark, luxury redesign with SVG illustration
- [x] Landing, household, receipt, try, fleet, proof, how, judge; guided tour
- [x] 17 end-to-end checks and the five-viewport gates in normal and reduced motion

## Phase 8 to 9. Submission
- [x] `SECURITY.md`, `SDK_SURFACE.md` (generated), `JUDGE.md`, `README.md`
- [ ] `/try` live test on the pooled Sprite
- [ ] Video from the tour render (`?tour=1&render=1`)
- [ ] Posts and form: owner approval, then submit and tag

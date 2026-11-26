# TASK.md

Every task is ticked `[x]` with a commit hash only when it is done and verified. A task that is only scaffolded stays
open. Tasks that need a live account (Fly, partner keys, GitHub repo) say `needs: <what>` and stay open until that
exists. "Verified" means a test or gate ran and passed; tasks proven only on the local emulator say so and stay open
when the task is about the platform.

## Phase 0. Ground
- [x] Repo `0xkinno/salvor` created and pushed; hooks, workflow, `.claude/settings.json`, `.gitignore`, MIT licence (7a6cfee, pushed 2026-11-26)
- [x] `reference/` cloned (20 repos, gitignored); notes per repo in `reference/notes/` (local, never committed)
- [x] G0: `RULES_EXTRACT.md`, `reference/LANE_MAP.md` (20 repos read plus a web search), `JUDGE_TASTE.md` (308e369)
- [x] G1: `SPONSOR_INTEL.md` with links and snapshots (308e369)
- [x] G2: `MOMENT.md` with verified sources and snapshots in `evidence/snapshots/` (b97ae59). Best Buy policy page unreadable from the build environment, recorded as FINDINGS Q14
- [x] Commit `FINDINGS.md` questions Q1 to Q17 before probing (6792274)

## Phase 1. Probe the platform (G5)
- [ ] Connectors created with the policy table; `scripts/setup-connectors.mjs` written and syntax checked (7e0dbb3); needs: `SPRITES_TOKEN` and the partner keys, Box needs one OAuth click
- [ ] `slv-home` created, service on 8080, app deployed at the final URL, reachability check; `scripts/deploy-home.mjs` written (7e0dbb3); needs: `SPRITES_TOKEN`
- [ ] `scripts/probe.mjs` answers Q1 to Q17; `PLATFORM_PROBE.md` written; rungs chosen; script written (7e0dbb3); needs: `SPRITES_TOKEN`
- [x] Apify actor chosen by measured completeness: `apify/e-commerce-scraping-tool` read 10 of 10 Target pages (price and title; no seller or regular price). Recorded in `FINDINGS.md` Q9

## Phase 2. The mechanism (G3)
- [x] `src/gateway.ts` with durable counters; `/api/status` measured, including an unreachable gateway shown as unreachable (5dbc3f0, tests in `test/server.test.ts`)
- [ ] `fleet.birth` creates a labelled, egress-locked receipt Sprite with worker and job, checkpoint "newborn". Passes on the emulator (de71d72); needs: the platform
- [ ] `observe` runs end to end in a receipt Sprite on a real Target URL; evidence, checkpoint, report. Passes on the emulator; needs: platform and Apify
- [ ] `notary.verifyEvidence` reads the file from the read-only mount and matches the hash. Logic and tamper case pass on the emulator; needs: the platform mount (Q4)
- [x] Delete tests written in `DISCOVERY.md` (b97ae59)

## Phase 3. The decision and the money
- [ ] Policy clauses for Target (holiday guarantee and 14-day) from snapshots with 25+ tests (fda4d7c, 39 tests); Best Buy clause is unverified and held, needs: a readable policy page (Q14)
- [ ] Jev client with the real response shape; Pinecone match (embed, query, rerank); recall test. Client and parser written and tested against the documented shape (de71d72); needs: live Jev route (Q9) and Pinecone key
- [ ] Threshold tau chosen on the tune split; code gate: owed only when same_item=exact and conf >= tau, or human confirmed. Gate done and tested (fda4d7c); `scripts/tune.mjs` written; needs: labelled pairs
- [x] Claim builder: amount from the engine, digest-bound approval, single use (de71d72, tested in `test/pipeline.test.ts`)

## Phase 4. Intake and hands
- [ ] AgentMail inbox: forwarded order email -> Ollama lines -> receipt record; code written (5dbc3f0); needs: AgentMail and Ollama keys
- [ ] Box intake folder polling; photo -> Ollama vision lines; status written back; code written (5dbc3f0); needs: Box OAuth and Ollama key
- [ ] Claim packet (HTML and PDF) uploaded to Box `Salvor/Claims/<id>` with a shared link; packet and PDF render tested (de71d72), upload code written; needs: Box
- [ ] Claim delivery: email to the test inbox only, or chat script card; recipient allowlist enforced in code (5dbc3f0); needs: AgentMail key and the test inbox address
- [x] House-style filter on all model output; amount-in-text check (fda4d7c era, `src/house/style.ts`, `test/house.test.ts`, c3a4961)

## Phase 5. The clock and the unattended run
- [ ] `scripts/setup-apify.mjs` creates the schedule and webhook; written (7e0dbb3); needs: `APIFY_TOKEN` and the live URL
- [x] Webhook handler: verify secret, idempotent by run id, wake receipt Sprites (pool of 3) (5dbc3f0; secret, duplicate and bad payload tested in `test/server.test.ts`, idempotent wake in `test/pipeline.test.ts`)
- [x] Backup knock: GitHub Actions cron calling `/tick` with a secret; both wake sources named in README (4a98a81). Needs the repository secrets once the repo exists
- [ ] First unattended run recorded (nobody started it); evidence in `evidence/runs/`. The Apify schedule (every 6 hours) and a baseline run started 2026-11-26; ingestion into run files needs the ingest script after the watch has data

## Phase 6. Proof (G6 then runs)
- [x] `PROOF_PLAN.md` committed before any study run (308e369)
- [ ] P1 item list frozen and hashed; study run; misses by id. `scripts/study.mjs` written (b97ae59); needs: Apify and a frozen URL list
- [ ] P2 watch running; P3 labels, Jev against LLM ablation; P4 usage costs. Scripts written; needs: live accounts and the owner's labels
- [ ] P5 break campaign with each case recorded; `scripts/break.mjs` written (4989355); needs: live Sprites. P6 `/try` code and caps written and tested for input refusal (5dbc3f0); needs: live pool
- [x] `scripts/facts.mjs` -> `docs/FACTS.json`; CI checks it (c3a4961, 831202b)

## Phase 7. UI (Part 10)
- [x] `DESIGN.md`; fonts downloaded with licences; mark and wordmark SVG (7a43318)
- [x] Landing sections 1 to 8 with hero SVG and signature motion (7a43318, af194b5)
- [x] App, receipt detail, ask card, claim sheet, fleet, proof, how, try, judge (7a43318)
- [x] Guided tour (7 steps) and render mode `?tour=1&render=1` (7a43318)
- [x] Playwright gates at 5 viewports pass in normal and reduced motion (80 page runs, af194b5 and later); two logged design passes in `docs/design-changes-1.md` and `-2.md` (4a98a81)

## Phase 8. Judge door and red team
- [ ] `/judge` walk preloaded with a recorded live run; public lock, caps and kill switch are built and tested (5dbc3f0, 4a98a81); the recorded live run needs the platform
- [ ] `JUDGE.md` written (b97ae59); deploy reachability check curls every public route; needs: the live URL
- [ ] G9: five judge agents on the live URL until a clean round; `REDTEAM_LOG.md`; needs: the live URL

## Phase 9. Story and submission
- [ ] README from FACTS (831202b); screenshots and hero PNG exist from the sample household and are retaken from the live site; needs: the first live run
- [x] `SECURITY.md` threat model table; `SDK_SURFACE.md` generated with file:line (b97ae59)
- [ ] Video recorded from the tour render; needs: the live site with real numbers
- [ ] `SUBMISSION_HACKSGIVING.md` written (4989355); posts drafted; owner approves; submitted 2+ hours early; tag; freeze; needs: the owner

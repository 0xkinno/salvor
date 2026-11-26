# TASK.md

Every task is ticked `[x]` with a commit hash only when it is done and verified. A task that is
only scaffolded stays open. Tasks that need a live account (Fly, partner keys, GitHub repo) say
`needs: <what>` and stay open until that exists.

## Phase 0. Ground
- [ ] Repo `0xkinno/salvor` created; hooks, workflow, `.claude/settings.json`, `.gitignore`, MIT licence (local files done; needs: GitHub repo and push token for the remote)
- [ ] `reference/` cloned (20 repos); notes per repo in `reference/notes/<repo>.md`
- [ ] G0: `RULES_EXTRACT.md`, `reference/LANE_MAP.md` (full-field search), `JUDGE_TASTE.md`
- [ ] G1: `SPONSOR_INTEL.md` with links and snapshots
- [ ] G2: `MOMENT.md` with verified sources and snapshots in `evidence/snapshots/`
- [ ] Commit `FINDINGS.md` questions Q1 to Q11 before probing (hash recorded)

## Phase 1. Probe the platform (G5)
- [ ] Connectors created with the policy table (Part 4.4); scripted by `scripts/setup-connectors.mjs` (needs: Sprites token and partner keys)
- [ ] `slv-home` created, service on 8080, empty app deployed at final URL, reachability check script (needs: Sprites token)
- [ ] `scripts/probe.mjs` answers Q1 to Q11; `PLATFORM_PROBE.md` written; fallback rungs chosen and labelled (needs: Sprites token and partner keys)
- [ ] Apify actor chosen by measured completeness on 10 known URLs (needs: Apify token)

## Phase 2. The mechanism (G3)
- [ ] `src/gateway.ts` with durable counters; `/api/status` measured
- [ ] `fleet.birth` creates a labelled, egress-locked receipt Sprite with worker and job, checkpoint "newborn"
- [ ] `observe` runs end to end in a receipt Sprite on a real Target URL; evidence, checkpoint, report
- [ ] `notary.verifyEvidence` reads the file from the read-only mount and matches the hash
- [ ] Delete tests written in `DISCOVERY.md`

## Phase 3. The decision and the money
- [ ] Policy clauses for Target (holiday guarantee and 14-day) and Best Buy from snapshots; 25+ tests
- [ ] Jev client with the real response shape; Pinecone match (embed, query, rerank); recall test
- [ ] Threshold tau chosen on the tune split; code gate: owed only when same_item=exact and conf >= tau, or human confirmed
- [ ] Claim builder: amount from the engine, digest-bound approval, single use

## Phase 4. Intake and hands
- [ ] AgentMail inbox: forwarded order email -> Ollama lines -> receipt record
- [ ] Box intake folder polling; photo -> Ollama vision lines; status written back
- [ ] Claim packet (HTML and PDF) uploaded to Box `Salvor/Claims/<id>` with a shared link
- [ ] Claim delivery: email to the test inbox only (never to a store during the hackathon), or chat script card
- [ ] House-style filter on all model output; amount-in-text check

## Phase 5. The clock and the unattended run
- [ ] `scripts/setup-apify.mjs` creates the schedule and webhook to `/hooks/apify/<secret>`
- [ ] Webhook handler: verify secret, idempotent by run id, wake receipt Sprites (pool of 3)
- [ ] Backup knock: GitHub Actions cron calling `/tick` with a secret; both wake sources named in README
- [ ] First unattended run recorded (nobody started it); evidence in `evidence/runs/`

## Phase 6. Proof (G6 then runs)
- [ ] `PROOF_PLAN.md` committed before any study run
- [ ] P1 item list frozen and hashed; study run on `slv-study`; misses by id
- [ ] P2 watch running; P3 labels (codebook, tune/test split), Jev vs LLM ablation; P4 usage costs
- [ ] P5 break campaign with each case recorded (failures kept); P6 `/try` working with caps
- [ ] `scripts/facts.mjs` -> `docs/FACTS.json`; CI checks it

## Phase 7. UI (Part 10)
- [ ] `DESIGN.md`; fonts downloaded with licences; mark and wordmark SVG
- [ ] Landing sections 1 to 8 with hero SVG and signature motion
- [ ] App, receipt detail, ask card, claim sheet, fleet, proof, how, try
- [ ] Guided tour (7 steps) and render mode
- [ ] Playwright gates at 5 viewports pass; two logged design passes

## Phase 8. Judge door and red team
- [ ] `/judge` walk preloaded with a recorded live run; public lock, caps, kill switch
- [ ] `JUDGE.md`; deploy reachability check curls every public route
- [ ] G9: five judge agents on the live URL until a clean round; `REDTEAM_LOG.md`

## Phase 9. Story and submission
- [ ] README from FACTS; screenshots; hero PNG
- [ ] `SECURITY.md` threat model table; `SDK_SURFACE.md` with file:line and versions
- [ ] Video recorded from the tour render (hook first, failure shown, Fly dashboard and `/fleet` shown)
- [ ] `SUBMISSION_HACKSGIVING.md`; posts drafted; owner approves; submitted 2+ hours early; tag; freeze

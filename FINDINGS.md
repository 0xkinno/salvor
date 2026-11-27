# FINDINGS.md

Pre-registered before any probe ran (V5 R16). The questions and their fallback ladders are written first,
committed, and only then answered against real accounts by `scripts/probe.mjs`. Answers are appended below
the line in the "Answers" section with the hash of the pre-registration commit.

Honest note on timing: the build started on Thursday of the hackathon week, not on day one. Every feature that
depends on an unprobed behaviour below was written with a labelled fallback so that no feature stands on an
assumption. Where a fallback is used it is named in the UI, in `/api/status`, in the README and here.

## Load-bearing assumptions and fallback ladders

| # | Question | Why it is load-bearing | Fallback ladder (highest rung that works is used and labelled) |
|---|---|---|---|
| Q1 | Can a Custom API connector point at `https://api.sprites.dev` so `slv-home` can create, exec, write files, set network policy, checkpoint, read usage and delete Sprites with no key on the box? Which token type is long lived and can it be restricted? | The "no key on any Sprite" claim, and home waking the children | (a) custom connector with the Sprites token held by the gateway; (b) a scoped Sprites token in a 0600 file on `slv-home` only, shown on `/proof` as the single credential on any Sprite with its scope; (c) receipt Sprites created by a human-run script |
| Q2 | Can labels be set on a Sprite? The documented REST surface has no label route (only the CLI `sprite config update --label` and `sprite create --label`). Do `sprite_labels` policies match them? | Labels are the permission model: `salvor-eyes` against `salvor-hands` | Use `name_prefix` instead. Receipt Sprites are all named `slv-r-*` (including the judge pool `slv-r-try-*`), home is `slv-home`, so a prefix of `slv-r-` selects exactly the eyes. One connection per prefix family |
| Q3 | Does a network policy of only `api.sprites.dev` still let the gateway work from inside the Sprite? Does `dig www.target.com` return REFUSED? | The egress lock | Add the exact gateway host the docs name; record it |
| Q4 | Is a new checkpoint visible under `/.sprite/checkpoints/vN/` immediately? What is the exact output of `sprite-env checkpoints create`? | Evidence is verified from that mount | Record the delay and wait for it before reporting |
| Q5 | Does the gateway enforce methods on custom connectors (is a GET-allowed path also open to DELETE)? | The access policy lists paths, not methods | Friction report entry; add `blocked_endpoints` |
| Q6 | Can `POST /v1/sprites` be restricted by name through path rules? (The name is in the body, so likely not) | Home must not create arbitrary Sprites | Friction report entry F2; home code validates names (`src/connectors/sprites.ts` refuses anything but `slv-*`); children can only be touched under `/v1/sprites/slv-*` |
| Q7 | Does the usage API return data for a Sprite deleted minutes ago? How fresh is it? What does `partial` mean in practice? | Cost per receipt comes from the platform meter | Book cost after a delay; show `partial` honestly |
| Q8 | Free plan: how many Sprites per org? Cold against warm wake latency of an exec? | One Sprite per receipt | If the cap is low, run receipts per retailer order and recycle the judge pool by checkpoint restore |
| Q9 | Jev route and response shape; which Apify actor (3 Target and 2 Best Buy candidates on 10 known URLs: field completeness, seller field, variant fields, cost per result, success rate) | The decision and the eyes | Choose by measured completeness; record cost per check. Jev route candidates: `/v1/decisions`, `/v1/decide`, `/v1/systemone` |
| Q10 | Box: can a free account use metadata templates? Shared links? Does the gateway forward `POST /2.0/files/content` (the real upload host is `upload.box.com`)? | Filing the claim packet | Use the file description field and a `claim.json` sidecar; if upload cannot pass the gateway, label Box filing as a substitute (claim packet served from `/claims/:id`) |
| Q11 | Ollama Cloud: which vision model is available through the connector? Does `/api/chat` with `images` pass through the gateway (body size)? | Receipt intake | Smaller image, or PDF text extraction first (`src/home/intake.ts#pdfText`) |
| Q12 | What is the exact wire format of `POST /v1/sprites/{name}/exec` (frames, JSON, raw)? | Parsing worker output | `parseExec` accepts frames, JSON and raw; record the real one |
| Q13 | Does the Apify connector let a receipt Sprite call `/v2/actor-tasks/*/runs/last`? | The backup knock path | Wake with the run id from the webhook only; the backup tick then re-sends the last webhook payload |
| Q14 | Can Apify read the Best Buy price match policy page so a snapshot and clause can be saved? The build environment could not reach it. | Best Buy is the second retailer | Best Buy stays held and labelled "no verified clause". Salvor does not estimate a claim without a verified clause |
| Q15 | Can Apify read archived (Wayback) Target product pages for the early-November prices (P1)? | The headline study | Use the Apify run history of our own watch list from Nov 26 onward; label the study "watched from Nov 26" instead of "early November" |
| Q16 | What status and body does the gateway return when a policy denies a call (`403 endpoint not allowed`, `403 connection denies all sprites by default`)? Is the Sprite identity visible in the response? | The break campaign claims (P5c) | Record verbatim |
| Q17 | Does a Sprite's `sprite-env` socket work for a non-root worker started through the exec API? | Checkpointing from inside | Checkpoint from home through `POST /v1/sprites/{name}/checkpoint` after the worker exits |

## Facts already established on 2026-11-26 from public documentation and this build environment

These are observations, not answers to the questions above. Sources are in `evidence/snapshots/`.

- F1. The Connectors API can create custom API connectors with an `access_policy` (`sprite_labels`, `name_prefix`, `allowed_endpoints`, `blocked_endpoints`, `allow_all`). So connector setup can be scripted (`scripts/setup-connectors.mjs`); it does not need the dashboard. Source: `fly-connectors.txt`, `fly-openapi.json`.
- F2. `POST /v1/sprites` takes only `name` and `url_settings`. There is no documented label field on create or update. Labels appear on the Sprite object. Source: `fly-openapi.json` (Sprites API 0.1.12). This is Q2.
- F3. The gateway returns `401` to a caller outside a running Sprite ("Gateway calls must originate from inside a running Sprite"). Observed from this build container: `GET https://api.sprites.dev/v1/gateway/list` returned 401. `/api/status` shows the measured result.
- F4. The Sprites usage API returns `cpu_time_sec` and `reserved_memory_byte_sec` per interval, with a `partial` flag, for deleted Sprites too. Source: `fly-api-usage-read-sprite-usage.txt`. Published rates: $0.0385 per CPU-hour, $0.021875 per GB-hour of memory, $0.02 per GB-month cold storage. Source: `fly-pricing.txt`.
- F5. Target's price match page states: the Holiday Price Match Guarantee covers purchases from 2026-11-01 where the price goes lower at Target on or before 2026-12-24; matches may be requested at time of purchase or within 14 days after purchase; the identical item is required; exclusions include clearance, closeout, third party (Target Plus) items, bundles, pre-orders, open box and others. Source: `target-price-match-help.txt`, `target-holiday-fact-sheet.txt`.
- F6. The holiday guarantee text does not state a separate request deadline. Salvor treats 2026-12-24 as the deadline and says so on every claim (`src/policy/clauses.ts`).
- F7. The Wayback Machine and bestbuy.com were not reachable from the build container (connection refused through the proxy). This is Q14 and Q15. It does not affect the deployed app, which reads pages through Apify.
- F8. Node on the build container is 22.23. Node 22 runs `.ts` files directly and ships `node:sqlite` without a flag, so the zero-dependency server and worker run unchanged. Node on the Sprite is checked by the probe.
- F9. The TypeSafe Jev response shape (from the AI/ML API schema mirror): `answers.<key>.type` is `choice`, `noul` or `score`; a choice carries `choice`, `confidence` and `probabilities`; a `noul` carries `noul` (probability of yes). Source: `jev-aimlapi.txt`. The first-party route and base URL are Q9.

## Answers

(appended by `scripts/probe.mjs` runs, each with its date, the request and response redacted, and the rung chosen)

### Platform answers, 2026-11-26 (real account, real Sprites; raw logs in `PLATFORM_PROBE.md`)

Pre-registration commit: 6792274. Every answer below was observed, not read from docs. Where it went against us, the fallback in the table was used and is labelled everywhere.

- **Q1 Sprites API through a connector: NO (rung a impossible).** Creating a custom connector that points at the Sprites API succeeds, but every call through it is refused: `403 {"error":"blocked: base URL targets the Sprites API itself"}`. Rung b is used: `slv-home` holds one Sprites token in a 0600 file (`/home/sprite/salvor/secrets/sprites-token`). It is the only credential on any Sprite and `/proof` shows it. The token API accepts only a name; extra fields for restricting a token to `slv-*` were silently ignored and produced unrestricted tokens, so the restriction lives in our client (`src/connectors/sprites.ts` refuses any name outside `slv-*`). Also: a general Fly access token does not work on Sprites calls; `POST /v1/organizations/{org}/tokens` (authenticated with a Fly org token) mints a Sprites token. There is no documented way to revoke a minted token through the API.
- **Q2 labels: YES.** `PUT /v1/sprites/{name}` with `{"labels":["salvor-eyes"]}` sets them (`PATCH` is 404). A policy with `sprite_labels` is enforced: a labelled Sprite sees only the eyes connections in `/v1/gateway/list`, an unlabelled Sprite sees none. Policy updates need `PUT /v1/oauth/connections/{id}`; re-posting a create call does not change an existing policy.
- **Q3 egress: works as documented.** With one rule allowing `api.sprites.dev`, the gateway resolves and answers, `www.target.com` and `example.com` fail to resolve, and `/.sprite/policy/network.json` is read-only inside.
- **Q4 checkpoint mount: DOES NOT WORK (against the docs).** `/.sprite/checkpoints` is an empty tmpfs even 25 seconds after a checkpoint, while the checkpoint list API shows the checkpoints. `sprite-env checkpoints create` prints newline-delimited JSON and the id is on the `ID: vN` line. Fly takes an automatic `v1` ("initial checkpoint") at creation, so the first checkpoint we take is `v2`. Fallback used: the verifier takes a safety checkpoint, restores the cited checkpoint, reads the file, and restores the safety checkpoint, about 4 to 11 seconds, with the live state coming back unchanged. It also reads a witness from the checkpoint list: the comment carries the full evidence hash and Fly stamps the creation time. Real tamper test: with the live file edited after the checkpoint, the platform's copy still matches the claim and the live hash differs (`PLATFORM_PROBE.md`, P5e).
- **Q5 and Q6 method and name restrictions: not testable through a connector** because Q1 failed. Our client enforces `slv-*`.
- **Q7 usage for a deleted Sprite: 404 `sprite_not_found`**, immediately and 45 seconds later, even though the docs say deleted Sprites keep usage. The usage API is therefore read before deletion (`retire` already does this). It also returns `hot_storage_byte_sec` and `suspend_storage_byte_sec`, so storage is metered by the platform too.
- **Q8 account and latency:** A free Fly account without a card holds 3 Sprites in total. The fourth create returned HTTP 402 `dollar_trial_limit` (recorded verbatim in `evidence/probe/`). Create 191 ms, first exec 361 ms, warm exec 135 ms. Node 24.22.1 on the Sprite, user `sprite`, kernel 6.12. Salvor therefore keeps home, one try-it Sprite and one live receipt Sprite, retires settled receipts and starts the next.
- **Q9 Pinecone free plan:** the rerank model allows 500 requests per month across the organization and 90 documents per request. The monthly limit was reached during the hard ranking run (HTTP 429, RESOURCE_EXHAUSTED). Salvor's worker records that error in the evidence and the match falls back to the typed rules alone, which are stricter, so more lines go to a person. Larger pools are scored in slices of 90 and merged by score.
- **Q12 exec wire format:** frames of one marker byte followed by data, in the order the process wrote them: `0x01` stdout, `0x02` stderr, `0x03` then one exit-code byte. Our parser matches.
- **Q16 policy refusals:** `403 {"error":"endpoint is not in allowed list"}`. Real checks from a labelled Sprite: an allowed Apify dataset read and a Pinecone embed pass; `/v2/users/me` is refused.
- **One dedicated connector per provider.** Creating a second Pinecone connection overwrote the first, so eyes and hands each use a named custom connector for Pinecone.
- **Q17 checkpoint from inside a non-root worker through `sprite-env`:** works (the worker runs as `sprite`).

### Partner answers, 2026-11-26 (Apify, Pinecone, Ollama, AgentMail keys; run from the build machine)



- **Q9 Apify actor (answered).** `apify/e-commerce-scraping-tool` read 10 of 10 Target product pages found by a search page run. Fields returned: `name`, `offers.price`, `offers.priceText`, `offers.priceCurrency`, `url`, `image`, `rating`, `reviewCount`. Fields returned empty: `offers.availability`, `brand.name`, `gtin`. Not returned at all: seller, regular price. Cost: $0.0751 for 10 detail pages ($0.0075 per page). Consequence: the third-party seller exclusion cannot be read from the page, so a missing seller is treated as unknown, not as Target, and the claim packet tells the user to confirm "sold by Target". The regular (was) price is not shown. Raw log: `evidence/probe/actors-2026-11-26.json` (kept local).
- **Q15 archived prices (answered, against us).** Apify can fetch a Wayback URL, but the nearest snapshot returned was dated 2026-05-14, and the archived page carries no price (`offers.price` null). Early-November prices are not obtainable this way. P1 is redesigned as "watched from first sight" (PROOF_PLAN amendment 1).
- **Q14 Best Buy policy page (still open).** The same actor timed out at 120 seconds on the Best Buy help page. Best Buy stays held.
- **Partners evaluated and not used.** TypeSafe Jev, Ollama Cloud chat and Box were evaluated. Jev and Ollama chat need paid credits before they answer (HTTP 402 on the build account) and Box needs an interactive OAuth login, so the build does not depend on them. The decision step is Salvor's own typed match (Pinecone rerank plus typed rules, `src/match.ts`) and the claim words are written by code.
- **Pinecone (answered).** The key works; `multilingual-e5-large` embeds through `POST /embed`. Index `salvor-household` (1024 dimensions, cosine, AWS us-east-1) was created for the household memory.
- **AgentMail (answered).** The key is scoped to one inbox (`kings-8183@agentmail.to`) and lacks the `inbox_read` permission for listing inboxes, but it can read that inbox's messages.

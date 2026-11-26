# PROOF_PLAN.md

Written before any study run (G6). Each study states an expected result that could come out against us. All runs
write `evidence/runs/<run>.jsonl`. `scripts/facts.mjs` reads only those files and writes `docs/FACTS.json`. CI
fails when FACTS is stale. Curated and wild data are reported apart. Misses are published by id.

| ID | Question | Data | Expected, including what would hurt us | Numbers reported |
|---|---|---|---|---|
| P1 | Of Target items with an early-November price on record, how many are cheaper in Black Friday week, and what is owed under the Holiday Price Match Guarantee? | Public data. Item list frozen from Target's public Black Friday ad and category pages and hashed before any price is read. Early price from an archived page read by Apify; current price read by Apify | Expect a large minority cheaper (Which? found most deals cheaper or equal in the six months after Black Friday, UK, 2020). It could be that archives exist for few items: then n is small and we say so. It could be that few items are cheaper: then the headline is a small dollar figure and we still publish it | n listed, n usable, share cheaper, total and median owed, misses by id and reason |
| P2 | Does the unattended watch wake, read and decide with nobody present? | Live. Apify schedule every 6 hours from the first deploy over the P1 list plus Best Buy items | Some runs will fail or return no price for some URLs. They are counted | runs completed, drops seen, first and latest run |
| P3 | How good is the same-item decision, in both directions? | About 200 labelled pairs (receipt line, listing): exact, other_variant, other_product. Labelled by the owner with a codebook (`evidence/labels/CODEBOOK.md`). Split 50/50 into tune and test. tau chosen on tune only. Curated and wild reported apart | A plain LLM may do about as well on easy pairs; the difference should show on near variants (6 quart against 8 quart). If Jev does not beat the baseline on the test split we publish that | wrong-claim rate, missed-claim rate, ask rate at tau; reliability bins; the same for the LLM baseline |
| P4 | What does one receipt cost? | Fly usage API for each retired receipt Sprite, priced with Fly's published rates, plus Apify cost per check | Cost is dominated by the Apify reads, not the Sprite. We report both | cost per receipt, per receipt per day, per claim; `partial` rows named |
| P5 | Can we break it? | Our harness | Every case has an expected result and an observed result. Failures stay in the table | (a) poisoned page text; (b) `SALVOR_SABOTAGE=variant`; (c) a receipt Sprite calls Box and AgentMail; (d) a receipt Sprite resolves target.com; (e) evidence edited after its checkpoint; (f) model draft with an amount not in the ledger |
| P6 | Does a stranger's receipt work live? | The judge's own link, price and date on `/try`, capped at 3 an hour | Some links will not parse; the page says so | latency to first decision, shown live |

## Pre-registered thresholds

- A claim is prepared only when `same_item = exact` with confidence at or above tau and the clause probability at or above tau_owed, or a person confirmed.
- tau starts at 0.90 and is replaced by the value chosen on the tune split. The chosen value is written to `evidence/runs/p3.jsonl` as a `p3_pick` record with `chosen_on: tune`.
- A reading older than 36 hours is never trusted (`STALE_AFTER_HOURS`).

## What would make us withdraw a headline

A wrong-claim rate above 5% at the chosen tau on the wild set, a verification failure that the verifier did not flag, or a clause misread. Any of these is written into `PROGRESS.md` with the fix.

## Amendment 1 (2026-11-26, before any study run)

Finding Q15 (FINDINGS.md): an archived early-November Target price cannot be obtained. The Wayback copy nearest to Nov 5 is from May and has no price. P1 is therefore changed, before any result exists, to:

**P1 (amended).** For 24 Target items on a frozen list (hash in `evidence/labels/p1-items.sha256`), take the first reading on Nov 26 as the price a buyer on Nov 26 would have paid. For each later scheduled reading through the end of the watch, record whether Target's price fell below that first reading. Under the Holiday Price Match Guarantee a buyer from Nov 1 is owed that difference if the lower price appears on or before Dec 24. Reported: items with a usable first and later reading, the share that fell, total and median owed per unit, misses by id. The headline says "watched from Nov 26", not "early November".

The expected result could come out against us: few items may fall, and a watch of a few days is short. Both are published as measured.

## Amendment 2 (2026-11-26, before the first P3 result)

The build is four partner products: Fly Sprites, Apify, Pinecone and AgentMail. The same-item decision is Salvor's own typed match: Pinecone's rerank score is the evidence about the words and typed rules check size, capacity, pack count and model number. P3 therefore measures that decision, and its ablation compares the full match with the typed rules alone (lexical word coverage standing in for the rerank score). A second measurement, P3b, ranks each receipt line against all candidate listings with Pinecone and with plain word overlap (top one and top three).

P3 uses curated pairs built by `scripts/build-pairs.mjs` from the real listings the watch read, with labels true by construction. They are reported as curated. Wild pairs come from live runs.

The matcher was revised twice after measurements, and each earlier run is kept in `evidence/runs/archive/`: the first run showed the rules-only baseline had no stand-in for the rerank score and that a line with two quantities of one unit could hide a size conflict; the second showed lines with nothing specific to match on should never auto-claim. The tune rule never picks a threshold below 0.90.

# SUBMISSION_HACKSGIVING.md

Mirrors the Google Form (https://docs.google.com/forms/d/e/1FAIpQLSfZ_xearoDOSRXI3VjAbM4BJlObUdxSFO0SDwyZ8G6M2lapRQ/viewform).
Nothing here is submitted or posted until the owner approves (plan rule 3). Deadline: before midnight PST Nov 29, which is
09:00 WAT Monday Nov 30. Target: submit at least two hours before.

## Form fields

| Field | Value |
|---|---|
| Link to code | https://github.com/0xkinno/salvor (public; set when the repository exists) |
| Link to demo | the `slv-home` Sprite URL, plus the video link. Both go in the description |
| One or two sentences | Salvor gives every receipt its own sleeping Fly Sprite. It wakes when Apify sees the price fall, lets TypeSafe Jev decide whether the store owes you, and files a claim packet in your Box. |

Replace the last sentence with the generated numbers from `docs/FACTS.json` once they exist.

## Social post (draft, owner posts)

Platforms: X and LinkedIn (Bluesky and Reddit optional). Video 60 to 120 seconds from the tour render. Tag `@flydotio`, `#Hacksgiving`.

> Teresa bought an air fryer at Target on Nov 9. On Black Friday it cost less, and Target's own holiday guarantee says they owe her the difference. They won't tell her. So every receipt gets its own sleeping computer on @flydotio Sprites, and it wakes when the price falls. Live: <url>/try  Proof: <url>/proof #Hacksgiving

The first line is the hook, not the tech. The real numbers replace the example ones before posting.

## Video outline (from `?tour=1&render=1`)

1. 0:00 Hook, spoken, with the real item and real prices from the recorded run.
2. 0:20 The household: each receipt with its own Sprite, most asleep.
3. 0:35 One receipt: then and now, Jev's decision, the clause with its source.
4. 0:50 Verify this claim: both hashes from Fly's read-only copy.
5. 1:05 A failure on purpose: a different variant is dropped and Salvor says why.
6. 1:20 Fly dashboard beside `/fleet`: the same Sprites, labels and egress rule.
7. 1:35 Proof page: the number, the misses, the cost per receipt.

The video and the UI avoid the words listed in `scripts/check-copy.mjs`. No competitor is named.

## Checklist before submitting

- [ ] Live URL answers `/health`, `/`, `/judge`, `/try`, `/proof` (deploy reachability check)
- [ ] `docs/FACTS.json` generated from real run files; README block filled
- [ ] Five judge agents ran against the live URL until a clean round (`REDTEAM_LOG.md`)
- [ ] Owner approved the form text and the posts
- [ ] Commit tagged `hacksgiving-2026`, then no deploys to the submitted URL (G11)

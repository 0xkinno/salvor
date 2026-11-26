# JUDGE_TASTE.md

The partner products Salvor uses, a phrase from each one's own documentation, the job it does here, and a score
(0 to 3) for how well the design matches what the product is proud of. Phrases come from the snapshots in
`evidence/snapshots/`.

| Product | In its words | Job in Salvor | Delete test | Fit |
|---|---|---|---|---|
| Fly Sprites | "a hardware isolated Linux computer that is exactly as persistent or disposable as you want it to be"; "Credentials never enter the computer" | One computer per receipt. Permissions are a label and a network rule. Evidence is a checkpoint. The bill is the usage meter | No cheap sleeping computers: per-receipt isolation collapses into one shared process | 3 |
| Apify | Actors do the web work, scheduled, results as datasets | The eyes on store pages, and the clock: a schedule plus a webhook that knocks the home Sprite | No readings and no clock: nothing wakes | 3 |
| Pinecone | Retrieval and rerank that change the answer | Embed and rerank find the right listing for a cryptic receipt line; the score is the evidence behind every match | Receipt lines stop finding their page (measured against plain word overlap) | 3 |
| AgentMail | Inboxes for agents | The human loop: forwarded orders in, questions and claims out, replies read as answers | Orders cannot come in; Salvor cannot ask or deliver | 3 |

## Taste notes taken from the docs

- Fly teaches checkpoints as a save point for unattended work and notes that they are "not version control". Salvor uses them as evidence. Fly documents a read-only mount of recent checkpoints; on the real platform that mount stayed empty, so the verifier restores the checkpoint, reads the file and restores the live state (FINDINGS Q4).
- Fly's Connectors page says the gateway identifies the calling Sprite from Fly's request signature and that a Sprite never holds the token. The proof page shows the secret-like environment names on the box as a measured row.
- Pinecone's integrated inference offers embed and rerank as one call surface. Salvor uses both and measures the rerank against a plain baseline (`scripts/p3-rank.mjs`).

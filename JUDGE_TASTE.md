# JUDGE_TASTE.md

Each judge's product, a phrase from its own documentation, the job it does in Salvor, and a score (0 to 3) for how
well the idea matches what the product is proud of. The score is ours, written before the numbers exist. Phrases
come from the snapshots in `evidence/snapshots/`.

| Judge | Product | In their words | Job in Salvor | Delete test | Fit |
|---|---|---|---|---|---|
| Scott Johnston | Fly Sprites | "a hardware isolated Linux computer that is exactly as persistent or disposable as you want it to be"; "Credentials never enter the computer" | One computer per receipt. Permissions are a label and an egress rule. Evidence is a checkpoint. The bill is the usage meter | No cheap sleeping computers: per-receipt isolation collapses into one shared process | 3 |
| Daniel Gafni | TypeSafe Jev | "Jev returns typed decisions with calibrated probabilities, so your software can account for uncertainty. Set the thresholds for when it acts autonomously and when it asks for review." | Decides same item (choice) and clause eligibility (noul). Below the threshold a person decides. The threshold is chosen on a held-out split | No claim is ever prepared | 3 |
| Carter Rabasa | Box | Content lives in Box and the agent works on it | Intake folder `Salvor/Receipts`; output folder `Salvor/Claims/<id>` with packet, PDF, evidence and a shared link the store can open | No evidence the store can open, no record Teresa already uses | 2 |
| Asaf Ashirov | Pinecone | Retrieval and rerank that change the answer | Embeds and reranks a cryptic receipt line against candidate listings; household memory of confirmed items | Receipt lines never find their page (recall measured with and without) | 2 |
| Michael Chiang | Ollama Cloud | Open models doing real work | Reads receipt photos, PDF text and forwarded emails into structured lines; writes the claim words (amounts inserted by code and screened) | No receipt intake; claim words fall back to a labelled template | 2 |
| Robert-George Crupa | Apify | Actors do the web work, scheduled, results as datasets | The eyes on store pages and the clock: a schedule plus a webhook that knocks the home Sprite | No readings and no clock: nothing wakes | 3 |
| (none) | AgentMail | Inboxes for agents | Receipts inbox and the claim email channel | Online orders cannot be forwarded in | 1 |

## Taste notes taken from the docs

- Fly teaches checkpoints as a save point for unattended work and notes that they are "not version control". Salvor uses them as evidence, which the docs do not suggest, so the friction report says so and the verifier reads only what the platform mounts.
- Fly's Connectors page says the gateway "identifies the calling Sprite from Fly.io's request signature" and that a Sprite never holds the token. Salvor's trust page shows the secret-like environment names on the box as a measured row.
- TypeSafe's page stresses thresholds for acting against asking. Salvor's `src/policy/gate.ts` is that sentence in code, and `/proof` shows both error directions at the chosen threshold.

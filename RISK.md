# RISK.md

| Risk | Likelihood | Impact | What we did |
|---|---|---|---|
| A wrong claim (asking for money not owed) | medium | high: trust | Same-item gate with a threshold chosen on a tune split and never below 0.90; clause exclusions typed and tested; human confirmation below threshold; claims go only to the owner's test inbox during the hackathon; both error directions published |
| A missed claim | medium | medium | Reported as the missed-claim rate; ask path catches uncertain cases rather than dropping them |
| Misread policy | low | high | Clauses carry source URL, snapshot file and checked date; unverified clause is unusable and holds the claim (Best Buy); the holiday request deadline gap is stated on every claim |
| Receipt privacy | medium | high | Receipt Sprites hold typed fields only; the `/try` pool Sprite is restored to a blank checkpoint after use; no visitor data kept; sample household is labelled |
| Prompt injection from store pages | medium | medium | Page text is read only inside receipt Sprites and only typed fields leave; amounts are computed by code from typed cents; P5(a) tests it; the Sprite's egress is the gateway only |
| Platform assumption fails (labels, connector route, upload host) | high | high | Pre-registered in FINDINGS.md with a fallback ladder per question; each fallback is labelled in UI, status and README |
| Rate limits and partner cost | medium | medium | Apify free credit is the cap; `/try` capped at 3 an hour; daily public approval cap; kill switch (`SALVOR_KILL=1`) stops all partner calls |
| Store sites block the actor | medium | high | Actor chosen by measured completeness (Q9); a failed read becomes "stale", never a guess |
| Late start (build began on Thursday of the week) | certain | medium | Recorded honestly in FINDINGS; proof studies use the watch from first deploy and say "watched from" with the real start date |
| Keys leaking | low | high | Keys live in connectors, not on Sprites; scripts read keys from the environment and never write them; logs are redacted; `.env*` ignored |
| Authorship or attribution leaking into git | low | high | Commit hook, CI check on every push, `.claude/settings.json` attribution off |

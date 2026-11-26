# EVIDENCE.md

Where every claim in this repository comes from.

| Folder | What it holds |
|---|---|
| `evidence/snapshots/` | Dated text copies of the policy pages and docs read on 2026-11-26. Each file starts with its source URL and retrieval date. Third-party text, kept for verification, exempt from our style check |
| `evidence/runs/` | JSON lines written by real runs only (study, watch, labels, cost, break campaign). `scripts/facts.mjs` reads nothing else. Empty until the first real run |
| `evidence/labels/` | The frozen P1 item list with its hash, the codebook and labelled pairs for P3 |
| `evidence/probe/` (not committed) | Redacted raw logs from `scripts/probe.mjs` and the connector setup. Excerpts go in `PLATFORM_PROBE.md` |

Rules: no number in the README or UI is typed by hand. A clause carries its source URL, snapshot file and checked date
(`src/policy/clauses.ts`). A run record is never edited after it is written; a rerun appends a new file.

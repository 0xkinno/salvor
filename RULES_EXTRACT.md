# RULES_EXTRACT.md

Verified against the live page https://fly.io/hacksgiving/ on 2026-11-26 (snapshot: `evidence/snapshots/fly-hacksgiving.txt`).

| Item | Value | Verified |
|---|---|---|
| Event | Fly.io Hacksgiving 2026 | yes |
| Window | Monday Nov 23 to Sunday Nov 29, 2026. "Submissions close before midnight PST on November 29" | yes |
| Winners | Announced by email Tuesday Dec 1 | yes |
| Required | An agent that lives on a Sprite and uses at least one Sprites connector. "Your project must be built during Hacksgiving week." | yes |
| Prizes | Grand Prize $2,500. Second Place $1,500. The Weird Uncle Award $1,000, "the strangest agent anyone builds" | yes |
| Judges | Daniel Gafni, Carter Rabasa, Scott Johnston, Asaf Ashirov, Michael Chiang, Robert-George Crupa | yes |
| Partner logos | Ollama is shown on the page header area; the page lists the judges by name | partly: the page lists names, companies per judge come from the plan |
| Criteria | Not published. The judges' own products are treated as the de facto rubric (V5 R15) | yes |
| Submission | Link to code, link to demo, a sentence or two about what the agent does, before midnight PST Nov 29 | yes |
| Share step | Post on X, Bluesky, LinkedIn or Reddit with a short demo and tag `@flydotio`. "Video demos always earn bonus points, but won't actually affect your score." | yes |
| Compute | Free on Fly's new Free plan. Every Sprite ships with Claude Code, Codex, Gemini CLI, Antigravity, Cursor, Pi and Grok | yes |

## What this means for the build

Six judges, six products. Each partner product Salvor uses has one load-bearing job with a delete test (`JUDGE_TASTE.md`).
Where a requirement cannot be met by the owner's accounts in time, the substitute is labelled everywhere.

## Our hard rules from this page

- Built during the week: the repository history starts on 2026-11-26 and contains no earlier code.
- Uses connectors: Apify and AgentMail through the dedicated connectors, Pinecone through named custom connectors (Fly allows one dedicated connector per provider). Connections are created with the Connectors API and deny-by-default policies.
- Deadline: 09:00 WAT Monday Nov 30 is the hard stop; the plan is to submit at least two hours before it.

# DISCOVERY.md (G3)

The smallest end-to-end mechanism: birth one receipt Sprite, take one observation, checkpoint, verify from the read-only mount.

## Status

| Check | Where | Result |
|---|---|---|
| Birth: create, label, write worker and job, lock egress, checkpoint "newborn" | `src/home/fleet.ts#birth` | passes on the local emulator (`test/pipeline.test.ts`). Not yet run on the platform: needs `SPRITES_TOKEN` |
| Observation: read dataset items, match, decide, write evidence, checkpoint, report | `src/receipt/observe.ts` | passes on the emulator. Not yet run on a real Target URL: needs the Apify token |
| Verify: read the file from `/.sprite/checkpoints/<id>/...`, hash, compare, flag a changed live file | `src/home/notary.ts` | passes on the emulator including the tamper case. The emulator copies a folder, so this proves our logic, not Fly's mount behaviour (FINDINGS Q4) |

This table is updated, with a date and the run record, when the same script runs on the platform. Until then no
README or UI line claims a platform result for these steps.

## Delete tests

| Feature | Delete it and |
|---|---|
| One Sprite per receipt | A poisoned page and the user's email credential share one process; per-receipt cost cannot be metered; there is no unit to retire when the right expires |
| Egress lock | An instruction hidden in a page could make the reader fetch anything |
| Access policy (labels or name prefix) | A reader could send email or write to Box |
| Checkpoint as evidence | The evidence exists only in our database, which we can edit; the tamper test (P5e) could not exist |
| Usage API | Cost is our estimate |
| Jev | No claim is ever prepared; the ablation (P3) compares with a plain LLM |
| Pinecone | Receipt lines do not find their listing; recall is measured with and without |
| Apify | No reading and no clock |
| Box | No evidence the store can open |
| Ollama | No receipt intake |
| AgentMail | Forwarded order emails cannot be ingested |

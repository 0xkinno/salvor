# THESIS.md

```
NAME:       SALVOR (one who recovers value that would otherwise be lost)
MOMENT:     Teresa, a night shift pharmacist (example shopper), at 7:10am after her shift on Black Friday,
            when the air fryer she bought on Nov 9 for $X is now $Y at the same store, and Target's own
            Holiday Price Match Guarantee owes her the difference, but nobody told her.
ACTION:     Salvor watches each receipt from its own sleeping Sprite, decides with Jev whether the store owes
            money, files the evidence in her Box, and hands her a one-tap claim.
DISCOVERY:  Everyone assumes price-drop refunds are rare luck; in reality, under Target's 2026 holiday
            guarantee, [FACTS.share_cheaper] of early-November items in our real sample were cheaper in Black
            Friday week (generated from docs/FACTS.json, never typed).
PROOF:      [FACTS.n_items] real items, [FACTS.owed_total_cents] owed, wrong-claim rate
            [FACTS.wrong_claim_rate] at the chosen threshold, misses named, cost per receipt
            [FACTS.cost_per_receipt_usd] from Fly's own usage meter.
```

## Blurb (40 words or fewer)

Salvor gives every receipt its own sleeping Sprite. It wakes when Apify sees the price fall, lets Jev decide whether the store owes you, and hands you a Box-filed claim. It measured real owed money on real Black Friday items.

(The README replaces the last sentence with generated numbers.)

## Spoken hook (20 seconds)

"Teresa bought an air fryer at Target on November 9th. This morning, Black Friday, it costs fifty dollars less. Target's own holiday guarantee says they owe her the difference. Target will not tell her. Salvor gave her receipt its own little computer on Fly.io. It slept for free for eighteen days, woke up this morning, saw the price, and put the claim in her hand."

The video uses the real numbers from the recorded run, not these example ones.

## Primary guarantee

Salvor never asks a store for money it is not owed. Every claim is backed by the store's own published clause, a
same-item decision above the calibrated threshold or a human confirmation, and evidence the platform holds a copy of.

## Interruption budget and abstention

At most one question per receipt per day, and only when Jev's confidence is under the threshold or a claim is ready.
Always through: money owed with the window closing in 48 hours or less. "Not sure yet" is a designed state: unclear
variant, marketplace seller, clearance, out of stock or a stale page all hold the claim and say why.

## Memory policy

Only Teresa's confirmations ("yes, that is the same item", "I bought it in store") become durable facts
(`facts_human`). A model guess never does.

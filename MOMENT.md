# MOMENT.md

## The person and the clock

Teresa Alvarado is a night shift pharmacist in Tucson, Arizona. She is an example shopper we invented to tell the
story (the persona is fictional and is labelled as an example wherever it appears; the receipts in the sample
household are sample data). She buys gifts on her phone on breaks. Her shift ends at 7:00 am. On Black Friday,
Nov 27, 2026, at 7:10 am she is on her way home.

## What is true, with sources

Every row was read on 2026-11-26 and saved as a dated text snapshot.

| Claim | Source | Snapshot |
|---|---|---|
| Target's Holiday Price Match Guarantee: "Starting November 1, 2026, if you purchase an item in store or online and the price goes lower at Target on or before December 24, 2026, you can request a price match." | https://www.target.com/help/article/000062256 | `evidence/snapshots/target-price-match-help.txt` |
| "Price matches may be requested at time of purchase or within 14 days after purchase." The item must be identical (brand, size, weight, color, quantity, model number). Original receipts or packing slips are required for adjustments up to 14 days after purchase. | same | same |
| Exclusions include clearance, closeout, liquidation, damaged, used, open package, refurbished, bundled offers, pre-order items, and Target Plus items. | same | same |
| Target's corporate fact sheet repeats that "Now through Dec. 24, Target's Holiday Price Match Guarantee helps you shop with confidence by matching Target's own prices if they go lower later in the season." Updated Nov 19, 2026. | https://corporate.target.com/press/fact-sheet/2026/11/holiday-shopping-information | `target-holiday-fact-sheet.txt` |
| Target ended competitor price matching in July 2025 and now matches only its own prices. | https://www.goodmorningamerica.com/living/story/target-end-longtime-price-matching-policy-find-123935014 | `gma-target-ends-price-matching.txt` |
| Black Friday 2026 is Nov 27, inside Hacksgiving week. | calendar | n/a |
| Which? tracked 201 Black Friday deals at six UK retailers daily for six months either side of Black Friday 2020 and found 99.5% were the same price or cheaper at other times of the year. UK data, used only as context. | https://www.which.co.uk/news/article/99-5-of-black-friday-deals-cheaper-or-the-same-price-at-other-times-of-the-year-ae7Qu2R0yHXW | `which-black-friday-2020.txt` |
| Consumer Reports: retailers often refund the difference if the purchase was within a set window, often 14 days, and a receipt helps. | https://www.consumerreports.org/shopping/can-you-get-a-deal-after-you-have-paid-full-price-a9725013802/ | `consumerreports-price-drop.txt` |

Correction logged: the build plan quoted the Which? figure as 98.5%. The page says 99.5%. The page figure is used.

Not verified: Best Buy's price match policy. The page could not be read from the build environment on 2026-11-26.
Best Buy claims are therefore held and labelled (FINDINGS Q14).

## The cost, with a source

Teresa's problem is not the amount of any single refund. It is the daily re-checking of every item she bought, at
every store, for weeks, to catch a drop the store will refund but will not announce. A night shift worker who
re-checks ten items a day for 45 days is doing 450 manual checks a season. The cost of one receipt on a Sprite is
read from Fly's usage API (P4) and shown on `/proof` once measured.

## The action and the artifact

Salvor hands Teresa a claim packet: the receipt line, the then-and-now price, the store's own clause with its
source and checked date, the deadline, and evidence the platform holds a copy of (a checkpoint id and a hash). It
is filed in her Box with a shared link. A claim email goes to the owner's test inbox during the hackathon, or a
three-line script is shown to say at Guest Services or paste into chat.

## What the human does that software cannot

She confirms the item when Jev is unsure ("is this the 6 quart, not the 8 quart?"), approves the claim, and makes
the ask, because the store only pays the customer. Only her confirmations become lasting facts.

## Everyone assumes X, in reality Y

Everyone assumes price-drop refunds are rare luck. In reality, under Target's 2026 holiday guarantee the store
owes the difference whenever its own price falls inside the window, and it does not tell the buyer. The share of
early-November items that fell is measured in P1 and printed on `/proof` from `docs/FACTS.json`.

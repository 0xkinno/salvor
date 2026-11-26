# Design pass 1

Captured from `docs/screens/` (five viewports, normal motion) after the first full build.

| Seen | Change |
|---|---|
| Hero receipt: the green stamp covered the "TODAY" price, so the headline number was unreadable | Receipt padding raised, stamp moved below the price row, item name on its own line, redundant struck price row removed |
| Hero: the folder card was clipped by the receipt, "Claims / No" | Folder card moved lower left and narrowed so the date reads in full |
| Hero: stamp clipped at the receipt bottom by the print animation's clip path | Clip path now extends 60 px below the receipt |
| Headline wrapped into four ragged lines with an orphan | Size reduced to `clamp(40px, 5.4vw, 70px)` and `text-wrap: balance` |
| axe: scrollable regions not keyboard focusable on iPhone and Android (serious) | Every horizontally scrollable container got `tabindex="0"`, a region role and a label |

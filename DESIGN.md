# DESIGN.md

## Direction

An editorial money magazine printed on warm ash paper, lit with a soft lilac glow. The idea: a thermal
receipt that keeps working after you leave the shop. Calm, premium, trustworthy. Not a crypto dashboard
and not a generic SaaS kit.

## Colour tokens

| Name | Value | Role |
|---|---|---|
| Paper | `#F6F4F0` | page |
| Paper-2 | `#EFEBE4` | cards on paper |
| Hairline | `#E2DCD2` | rules and borders |
| Lilac 50 / 100 / 200 / 300 | `#F5F1FE` / `#ECE5FD` / `#DACFFB` / `#BFAEF6` | glow, aurora, focus halos |
| Violet | `#6A4BE0` | the one accent per view: active nav pill, primary button, links |
| Violet-ink | `#4B33B5` | text on light surfaces (AA) |
| Ink | `#17132B` | text, dark buttons |
| Muted | `#5C566F` | secondary text |
| Owed | `#0E7A57` (text `#0B6648`) | money the store owes, only |
| Ember | `#C2410C` (text `#9A3412`) | deadlines under 48 hours |

Every text pair passes WCAG 2.2 AA. The gates run axe on every route at five viewports.

## Type

Self-hosted from `web/public/fonts/` with their licences, `font-display: swap`, tabular numerals for money.

- Display serif: **Gambetta** (Fontshare) for headlines and big numerals.
- UI sans: **Switzer** (Fontshare). The plan named General Sans or Satoshi; the Fontshare CSS endpoint returned Switzer for the General Sans request, and Switzer sits in the same family of neutral grotesques, so it is used.
- Receipts, hashes and Sprite names: **JetBrains Mono**.

## Ornament

Hairline rules, numbered eyebrows ("01 / THE RECEIPT"), tracked small caps, perforation edges on receipt
cards, a faint dot grid and paper grain.

## Motion

One signature moment: the hero receipt prints downward a few lines, the old price is struck through, and the
green stamp lands with a small spring. Everything else is quiet: staggered reveals, count-up numerals, a
gliding nav pill, card hover glow. `MotionConfig reducedMotion="user"` respects the system setting.

## Mark

An original mark: a receipt with a folded corner whose tear line forms an upward hook (recovery). Wordmark
"Salvor" in Gambetta. SVG, `currentColor`. No partner or store logos are used as decoration; partner names
appear as text.

## Copy rules

Plain words, short sentences. No dashes used as punctuation, no emoji, no hype words. The README, the UI and
the video avoid the words the owner banned (see `scripts/check-copy.mjs`). Example data is always labelled
"example" or "sample household", and a live number is always labelled with its source chip: real public data,
unattended run, or platform meter.

## States

Every screen has designed empty, loading, error, refused and asleep states. A loading state streams steps and
never leaves a blank wait over ten seconds. "Not sure yet" is a designed state, as carefully made as success.

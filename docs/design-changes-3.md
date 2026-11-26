# Design pass 3: the luxury redesign

Brief from the owner: use the floorprice concept, upgrade to a more luxurious, fashionable and premium interface in our own original design, with clean SVG illustration, glow on hover, and no bare areas.

| Area | Change |
|---|---|
| Atmosphere | Fixed aurora of three slow blobs (lilac, violet, champagne), dot grid and grain, plus a scroll progress bar |
| Cards | Glass surface, 1px border that lights up in violet and gold under the cursor, soft spotlight inside, lift on hover. Used for every box on the home page, including the stat tiles and the partners table |
| Hero | Midnight stage with orbit rings and a glowing cube holding a receipt on a thread; the receipt swings once and settles; glass chips (the match, the claim email, the checkpoint) drift with the pointer and sit clear of the receipt |
| New illustrations | Drawn timeline, constellation of Sprites with a ripple on the awake one, numbered roles line, bar motif in the proof band, orbit rings in the call to action |
| Marquee | Slow ticker of the seven products between hero and story, with gold hairlines |
| Inner pages | Illustrated banner at the top of the household, receipt, fleet, proof, how, try and judge pages |
| Type and ornament | Gold eyebrows with a leading rule, shimmering headline accent, display numerals in Gambetta |
| Fixed after review | Hero chips collided with the receipt, fleet illustration was too faint and small, fact cards were unevenly spaced, claim sheet padding leaked onto the border (responsive padding classes now move inside the card) |
| Checked | Playwright Chromium: 17 end-to-end checks; five viewports, normal and reduced motion, axe WCAG 2.2 AA, overlap checks |

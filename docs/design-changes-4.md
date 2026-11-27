# Design pass 4 (Nov 27)

Run against the live site (`scripts/gates.mjs --base=<live url>`): five viewports (390, 412, 768, 1280, 1440), normal and reduced motion, axe WCAG 2.2 AA, no horizontal scroll, every route.

Found and fixed:

- **Landing, Black Friday band.** A `dl` held a loading `div` and the hint paragraphs sat beside their `dd`, so axe flagged `definition-list`. The loading state moved outside the list and each hint moved inside its `dd`.
- **Proof, small screens.** The partner calls table and the hard-set miss list pushed the page wider than a phone. The table sits in a keyboard-reachable scroll region, grid children may shrink (`min-w-0`), and long id lists wrap.
- **Proof, hard ranking set.** A new block shows the 100 line set: ranked count, Pinecone against word overlap, the lines that were not ranked and why, and the set's frozen hash.
- **Try-it.** The page states that the product on the pasted link is treated as the item bought.

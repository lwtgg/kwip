# Review: the Apple look pass (51)

Review `task/51-apple-look` against `.prompts/51-apple-look.md`, `docs/redesign-51.md` and the owner
screenshots. The owner rejected the previous appearance with *"it doesn't look like it at all"*, so the bar is
**does the rendered page look like the app**, not whether the tokens are tidy. Do not edit files.

1. **Did the tile actually die?** The previous failure was a poster tile with a big number under it, four
   across. Check the identity of the thing on screen: is the listing a row — contained ground, identity at an
   edge, the numeric fact in its own lane at the other — or an old tile wearing new classes? Say plainly which
   at 320, 390 and 1280.
2. **Compare to the pixels.** Put a rendered row next to the reference shots. Judge ground, inset, radius,
   label scale, numeral weight and lane, the state's separation, and what is emphasised. Name each element the
   reference shows that is missing or wrong, and each thing we added that the reference would not have.
3. **Lane discipline.** Does the name truncate for the lane instead of the lane collapsing? Do the numerals stay
   tabular and reserved at 320 px and 200 % text? Does a long name still read? Is the state in the state type?
4. **Grouping and hero.** Do rails read as grouped sections rather than a tile carousel? Is the hero the same
   product as the rows beneath it, or a billboard on top of them?
5. **What had to stay.** One link per card with the full name in the accessible name, player page, source at the
   frame edge, banner below the player, date strip, tokens only, no dependency, density spacing-only, no score,
   no invented clock.
6. **Tint still gates.** The neutral fallback must still fire on a failing field; check a bad seed and the
   no-seed row look deliberate.
7. **Craft.** Inset and radius tokens, focus visible and unclipped in the rail scroller, reduced motion,
   `noscript`, 44 px targets, no horizontal overflow at 320.
8. **Evidence.** Contrast computed for every pair, CLS 0 at 390 and 1280 both themes including failed art, the
   full screenshot matrix present. Nothing weakened in the six suites — name any assertion that moved.
9. **The document.** Does `docs/redesign-51.md` cite real references and say what was taken from each, and does
   it match what was built? Flag any reference claim that the citation does not support.
10. **Budgets and gate.** `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild,
    dry-run, all six suites. Accept a gzip rise only within `kwip-budgets`.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`, each
with width, theme, density and the measurement as evidence.

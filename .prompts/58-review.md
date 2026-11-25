# Review — task 58, the banner is the whole card

`27ba445` on `task/58-banner-clean`. Read the owner's mockup `/Users/julian/Downloads/Updated Instructions.png`,
`.prompts/58-banner-clean.md` and `docs/redesign-58.md`, then verify each claim yourself.

The owner rejected the shipped card because it kept a category line, a long fixture sentence and a UTC kickoff.
The "after" mockup is a pure thumbnail: state on top, scores either side of the detail in the middle, away
abbreviation / viewers / home name along the bottom, over team colours and logos; SF Pro for text, Acumin for
scores. "There is no need for that extra info."

Break it or pass it:

1. **Mockup fidelity, tier by tier, at 320/390/1280, both themes, both densities.** Compare rendered geometry and
   type against the mockup, not against the doc. Say where the implementation departs and whether each departure
   is defensible.
2. **No extra info on a matched card**: no category, no fixture title sentence, no `CardTiming`, no visible UTC,
   no "Watch". Unmatched cards keep 51's composed row. Check both directions.
3. **Collision and clipping**: three-digit scores, a long detail, a long team name, the initials fallback with a
   missing and a failed logo — inside the card at every width, at 200 % text, with reduced motion. Initials must
   stay clear of the score column.
4. **The link and the label**: one link, full accessible name (teams, scores, detail, exact viewers, kickoff).
   No nested interactive element.
5. **Contrast measured off rendered pixels** against the floor, and that the scrim is still doing work.
6. **Ratio floor 3.5:1 at 320** and that the reported row heights reproduce.
7. **Unmatched regression**: height, ratio and composition unchanged from `6f526d6`.
8. **The mutation is real**: restore `CardTiming` in a matched card and show the suite red, then revert.
9. Tokens only, no magic values; removed tokens unused; both build presets; the whole gate and all suites.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with reproduced measurement. No edits.

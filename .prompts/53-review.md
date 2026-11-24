# Review — task 53, banner artwork

Branch `task/53-banner`, HEAD `e4c127c`. Read `.prompts/53-banner.md`, `docs/redesign-52.md`, the owner's
mockups `/Users/julian/Downloads/New Banner Designs.png` and `Top Event design.png`, and
`docs/redesign-53.md`. Review the diff, then prove it with your own build and captures at 320/390/1280, both
themes, both densities. Do not edit.

Check, at minimum:

1. **Fidelity to the mockup** — away left, home right, logos outside, scores inside, status column in the
   middle, progress bar at the foot. Ratio and scale to `docs/redesign-52.md`, not invented.
2. **Only the score is heavy.** Read computed weights for every banner text node at every width; a label at
   600 is a defect.
3. **Contrast.** The reported worst pair is `#ff0900 → #df1b27` at 4.55:1 — that is a red-on-red pair and it
   is inside 0.05 of the floor. Find the worst pair for every real fixture in the live feed at both sizes,
   and say whether the 4.55 is the true floor or the sweep is sampling the wrong pixels (a gradient midpoint
   between two stops is not sampled by endpoint pairs alone).
4. **Degradation** — no match, no logo, one bad logo, a bad colour, no colour, `score: null` in `pre`, and
   `always_live`. Each must still be a valid row at the 51 floors.
5. **The card is still one link**, no nested interactive element, and the accessible name carries both teams,
   the score, the state and the viewers; the visible banner is correctly hidden from it.
6. **51's floors** — ≥ 3.5:1 at 320 and 390 in every state, no broken time at 200 % text, no overflow, no
   truncated label.
7. **Tests** — do they fail on a broken banner? Break the side order and the floor and say what fails.
8. **Cost** — +2,093 B gzip client is a lot for a card; say where it goes and whether any of it can move to CSS.

Verdict on all of it, then defects as `path:line` with width, theme, density and the measurement. Reply
exactly `VERDICT: pass|fail` first.

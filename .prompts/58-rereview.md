# Re-review — task 58, the six findings

`c1bbae0` on `task/58-banner-clean`. Your earlier review is `/tmp/58-review.log`; the fix brief is
`.prompts/58-fix.md`. Verify each of your six findings specifically, then re-check that the fixes did not break
what already passed (tier proportion, logo position, contrast, ratio floor, unmatched cards).

For each:

1. Gutter at 200 % text, every fixture at 320/390/1280, both themes and densities, three-digit + 24-character
   detail included and the pre-game card. Overlap tolerance strict.
2. Fit floor: drawn ratios at 320/200 % for the worst cases; rows may grow but text must not shrink past the
   floor. Check the growth does not push the ratio floor below 3.5 at normal text.
3. 1280 score centres against the mockup (38.5 % / 57.6 %), logos unchanged.
4. Real 5-character abbreviation renders and is tested; empty abbreviation has a fallback; the doc names the
   two-abbreviation symmetry as a departure.
5. Accessible name: includes the visible state in the same words, has separators, no trailing progress value,
   one link, no nested interactive target. Check `Live`, `Upcoming` and `Final`.
6. Three-digit pair draws at the same scale as a one-digit pair when the column has room and only shrinks when
   it genuinely does not.

Then the regression sweep and the full gate yourself, the three mutation proofs, and both preset builds.
Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurement. No edits.

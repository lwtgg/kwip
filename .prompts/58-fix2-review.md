# Re-review — task 58, the root text-size findings

`b276019` on `task/58-banner-clean`, following `515000f` (uncommitted fix round) and the four findings of the
second review:

1. **Root text size 200 % fails.** `document.documentElement.style.fontSize = '200%'` at 320 px made the middle
   column 12.8 px, wrapped `Halftime` per character, grew the row to 835 px, and pushed the home logo and its
   label 4 px past the card edge. Required: the matrix at 320/390/1280 in both themes and densities with root
   text at 200 %, nothing painted outside the card, no per-character wrapping, and the same for a 24-character
   detail.
2. **Abbreviations break mid-word.** A five-character abbreviation must stay on one line at every width and
   text size.
3. **1024 px with a 24-character detail** overlapped the middle tier. Include 1024 px in the matrix and require
   real clearance.
4. **Gutter mutation not caught by measuring.** The assertion compared against the CSS token rather than the
   measured gap, so `--banner-gutter: 1px` passed. It must fail.

Verify each finding against the actual pixels, at `b276019` and, where useful, against the clean `515000f`
Worker built into a separate directory.

Then specifically scrutinise what this fix invented, since it is new layout rather than a tweak:

- The **stacked** variant (`[data-stacked]`): logos and scores on row 1, abbreviations row 2, state/detail/audience
  full-width below. Does it trigger only when the five columns genuinely cannot hold the floor, or does it
  collapse early at normal text and 320/390? Are scores and logos still aligned, the score scale still shared,
  the abbreviation still one line, and the gutter still present? Does it ever appear at 1280 px normal text, where
  the mockup's five-column composition is the point?
- The gutter is now vertical in the stacked layout. Is it real measured space, not padding on one side only?
- Status is tokenised into `.banner-status-word` spans with `Intl.Segmenter` for unspaced scripts and a monospace
  fallback for one over-wide word. Does the visible text still match the fixture exactly (no lost or doubled
  spaces, no trimmed characters)? Does the `sr-only` accessible name still carry the state in the same words?
- `--banner-status-leading` moved 1.2 → 1.3 and `min-width: 0` was added. Check tier clearance and that nothing
  else regressed.
- Does the fit pass still behave when measured before fonts settle, and is `data-stacked` cleared on every pass?

Regression sweep: tier proportion, logo position (320 and 1280), contrast, the 3.5 ratio at normal text, the
1280 score centres (38.5 % / 57.6 %), unmatched cards, hero, both themes, both densities.

Run the full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild,
`pnpm exec wrangler deploy --dry-run`, and every browser suite at 320/390/1024/1280. Do not run `wrangler dev`
against a tree that is being built. Re-run the gutter mutation and one root mutation yourself and show the red
output.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements from the runs. No edits, no
commits.

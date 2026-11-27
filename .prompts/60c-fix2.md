# 60c fix round 2 — the review's findings

Review verdict on `f3918fc` was **changes requested**. The full review is `/tmp/60c-review-opus.log`; the
reviewer's probes and screenshots are in `/tmp/60c-probe/` — reuse them. Work through every item, worst first.

**First, a correction to the record.** My brief's mockup fractions were wrong. I measured the top card's score
against the bottom card's logo by mistake. The reviewer measured both cards correctly: the mockup's score is
**0.47–0.56 × the logo**, and the name gap is **0.12–0.18 × the logo**. The owner's "too little" is about
absolute size (score ink 27–32 % of card height, against production's 21.7 %), not about beating the logo.

## 1. Defect: names collide with the audience at 320 px, 200 % root

2.25–3.25 px ink gap; it renders "CSU62 ViewersARIZ". The audience now shares the names' row with no lower
bound, and 60c stopped stacking this cell (Chromium AND WebKit). Fix by stacking (or giving the audience its own
row) when the middle cannot hold the gap, and add an ink word-gap assertion, abbreviation ink to audience ink,
of at least the gutter at every width, mode and scale. See `/tmp/60c-probe/out/halftime-320-hero-root.png`.

## 2. Scores: the hero is too large and got there by shrinking the logo

Built hero score/logo is 0.917–0.977 and the 1280 hero logo fell to about 93 px (`theme.css:717` derives the
logo from the score with a 0.73 factor and an inset). Nobody asked for a smaller logo.

- Restore the hero logo to its pre-60c size (102 px at 1280; check the token chain against `06566fd`).
- Bring the hero score/logo to about 0.75–0.80 — bigger than production's 0.58, under the mockup-relative
  extremes; this is the owner's "a bit bigger", not logo-height digits.
- Keep the listing ratio where it is (0.77); it is the right side of the brief.

## 3. Name gap needs a lower bound

Built gap is 0.087–0.094 × logo at normal text, about half the mockup, and the assertion is `0 ≤ gap ≤ 0.30`
so it would accept zero. Set the band to **0.12–0.22 × logo ink**, ink to ink, both scales. It must hold at
320 normal and as the root text scales.

## 4. Wide-detail cards put the state far too high

8.5–15.1 % of card height above centre against 20.6–30.4 % on ordinary cards, with 97–187 px of empty band.
Cause: the row-centre rule balances the tall lower stack with top padding, and the state floats in it. When
`[data-wide-detail]`, anchor the state to the row with the normal state gap and let the surplus sit above it.
Run the state-position band assertion on the wide-detail fixtures too (widest, long-status, CJK, long-word),
not only Halftime.

## 5. `WIDE_DETAIL` is one-directional and the doc lies

`tests/cards_browser.py:983` only fails when a listed slug is not wide, so 21 measured triples are unnoticed.
`docs/redesign-60.md:655` says the 390/root Hangul fixture "now fits between the scores" — it does not; it takes
the wide track in all four cells. Restore equality with an accurate table and correct the doc. If the table
would be unstable, bound the wide set from the measured fit and say so.

## 6. Restore the weakened stacked checks

`tests/cards_browser.py:430` sets the gutter to 0 when stacked, turning the score-to-middle assertion into a
no-op, and the stacked score-to-detail gap check was deleted. Stacked cards have no gutter floor left. Restore
both with the real gutter, and run the paint clearance checks on stacked, CJK, long-word and widest cells — not
only the parity fixtures.

## 7. Smaller items

- `score_overhang ≤ 2` (line ~1169) has no derivation and sits 0.33 px under the observed 1.672. Tie it to the
  leading, e.g. `(1 − leading) × size / 2`, or document it as an empirical tripwire.
- The score-centre band now runs only for Halftime and long-status; either restore it for the other scored wide
  listings alongside the gutter check, or say in the doc which fixtures carry it.
- Restore `assert red['row_offset'] < -2` in the red control — it should prove the old order pulls the row *up*.
- Add the plate-height change to the doc: the 1280 hero plate is 359 → 220 px, so at common laptop heights the
  player is above the fold and mounts on load; say what that does to rule 26.

## Gate

Full, to green, on a fresh default build: `pnpm test`, both presets, default rebuild, dry run, the whole card
suite including the pixel matrix, `tests/top_event_browser.py`. The reviewer's own probes are a good second
pass. Report numbers, including the new name-gap and state-band figures. Commit when green.

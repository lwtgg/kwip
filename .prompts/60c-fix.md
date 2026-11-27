# 60c fix round — four failures, the gate is red

`c5122ee` (task/60-scoreboard) builds the new order but does not gate. Run `pnpm build` first (Cloudflare
preset) and reproduce each item below. The geometry is largely right — 0.016 px maximum layout centre
offset and 514 parity checks inside their bounds — so keep the structure and fix these.

## 1. The detail is drawn below the fit floor

`tests/cards_browser.py:587` from the hero sub-case at `:1018` (`assert_clean_banner(hero, event, oracle,
listing_row=False)`): `('drawn below the fit floor', 'tier-2', 0.555556, 0.6)`. Tier 2 is the detail now
that the state is tier 1. A tier that cannot hold the floor must wrap or take the wide row, never be drawn
at 0.556. The wide-detail path exists for exactly this; the new row placement looks to have bypassed it.
Find which fixture and mode, and make the detail honour the floor: fit at or above it, else wrap in place
if the row can take it, else take the full-width row under the digits. The row centre and the
bottom clearance must hold in every resulting arrangement. Do not lower the floor.

## 2. `score centres` outside its band on a long detail

`('score centres', 'basketball/matched-long-status', [37.68798803028307, 62.31201071488229])` — the home
digits are 0.7 points past 57.6+4. The bigger score widened the pair. Either the wide-middle rule needs a
little more middle at 1024+ so the digits sit back inside the mockup's positions, or the band's home side
gets its own tolerance with a reason (the layout has moved since the band was calibrated; 38.5/57.6 came
from a narrower pair). Keep the away side within ±3.

## 3. `unexpected stacking` on a 200 % text mode at desktop

`('unexpected stacking', '1440-dark-comfortable', 'element', 'matched-widest')` and at 1280 the same.
At 1440 with element text scaled there is plenty of width, so `matched-widest` falling to `data-stacked`
means the score tracks are taking the room the stacked layout should only need at narrow widths. Check the
stacking decision after the score bump; the threshold must follow available width, not just the mixed-min
sum.

## 4. Score ink overhangs the score line box

The zoom probe shows 31 of 50 cells with the score/logo ink outside its line box, up to 1.672 px. Part of
that is the expected consequence of a bigger glyph in a tight leading, but the check exists to catch
collisions. Convert it to what actually matters: assert score-to-state and score-to-detail **ink** clearance
does not close below the gutter, and keep a bounded line-box bound (say 2 px) with a comment saying why the
box is allowed to be smaller than the ink now.

## Gate

Rebuild and run the whole gate, not a slice: `pnpm test`, both presets, default rebuild, dry run,
`tests/cards_browser.py .output --screenshots <dir>` to completion, `tests/top_event_browser.py`, and the
red controls in `css-controls-final` style. Note that `generation-stock` still fails on the known devalue
decoder and say so. Report the numbers you got, including the paint logo-centre maximum. Commit when green.

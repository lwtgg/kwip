# 60b — three gate findings

Gate on `76bca05` (task/60-scoreboard). Row centring itself is green: `row_offset` 0.00 px at every
width in both engines and at 200 % root text, and the red equal-padding control still fails with
~25 px. `top_event_browser.py` passes. Three findings remain; fix exactly these, nothing else.

## 1. `score centres` assert now runs at 768 px and is wrong there

`tests/cards_browser.py:628` asserts the scores sit at 38.5 % / 57.6 % of the card whenever the card is
≥ 600 px wide. The scoreboard CSS only pulls the scores towards the detail from `@media (width >=
64rem)` (1024 px); below that the 1fr score tracks put them at the outer thirds. The draft added 640
and 768 to the matrix, so 768 now fails with 26.08 % / 73.92 %.

Gate the assertion on the viewport, not the card: `card.page.viewport_size['width'] >= 1024`. Keep the
existing `box['width'] >= 600`. Do not change the layout. First failing cell:
`768 dark comfortable normal basketball/matched-live`.

## 2. `tier outside middle column` at WebKit 390, 200 % root text

`tests/cards_browser.py:669-670` allows 0.02 px. The wrapped detail starts 0.024994 px left of the
column (165.975006 vs 166) — sub-pixel rounding of a box laid out at 100 % / floor and drawn at the
floor, exactly what the comment on line 657 already acknowledges. The error is invisible but the
tolerance was calibrated before the taller row. Make the tolerance follow the root text size (the
rounding grows with the drawn box), e.g. `0.02 * geometry['rootSize'] / 16`, and keep the 16 px
bound at 0.02 px so nothing gets looser at normal text. Cap it at 0.05 px. Apply the same tolerance
to the mirrored `state outside middle column` check on line 658 only if it shares the rounding cause
— say why if you leave it alone.

## 3. WebKit 320 DPR 1: state ink 2.0 px off the score centre, limit 1.25

`measure_pixel_card` (`tests/cards_browser.py:1141`) recorded `pixels` score spans 382–404, state span
390–400, i.e. +2.0 px, while the model reports 0.0 px offset. At DPR 2/4/8 the same cell is inside the
limit. The state nudge comes from `inkOffset()` in `app/components/MatchBanner.vue`; it looks like the
translate is rounded to the device grid on paint but the model keeps the exact fraction.

Snap the nudge to the device pixel grid before writing `--banner-state-offset` (round with the current
`devicePixelRatio`), so layout and paint cannot disagree by a rasterisation step. Keep the model's
reported offset consistent with what is written. Do not widen the 1.25 px limit; if snapping alone
cannot hold it, report the numbers rather than loosening the check.

## Then

Unit tests, default build, and re-run: `tests/cards_browser.py .output --screenshots <dir>` at least
`--matches-only` and `--pixels-only` (rebuild default first — the suites need the Cloudflare `.output`,
not the node-server one), plus `tests/top_event_browser.py`. Report what you ran and the numbers.
Commit nothing; leave the tree ready for review.

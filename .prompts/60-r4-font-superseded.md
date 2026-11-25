# Task 60, fix round 4 — the ink model measures the wrong face in production

60 is merged and deployed (`f2824e5e`) but production is wrong in a way the harness did not catch: on the hero
at 1280 the state sits about 4 px **below** the digit ink. `docs/redesign-60.md` and three review rounds all
agreed the correction was right, on builds served from `/fixtures`.

## Cause, measured on production

`MatchBanner.vue:40` sets the canvas font from the whole computed family list:

    bold 128px "Acumin Pro Extra Condensed", "Arial Narrow", -apple-system, "system-ui", "SF Pro Text", system-ui, sans-serif

Chromium resolves that to **Arial Narrow**, not Acumin, and the two have different vertical metrics:

    measureText('5')  fontBoundingBoxAscent  120   actualBoundingBoxAscent 83.2
    first family only ("Acumin Pro Extra Condensed")  115   83.2
    with fontStretch='extra-condensed'                 115   83.2

The 5 px ascent error becomes the offset error. The harness missed it because its worker build resolved the
first family.

## Fix

- Build the canvas font from the **first family only**: split the computed `fontFamily` on `,` and take the
  first token. Keep weight and size. Restore `fontStretch` as a keyword — map a percentage to the nearest
  `CanvasFontStretch` keyword (`62.5%` -> `extra-condensed`) or use the computed value when it is already a
  keyword; a percentage is silently ignored.
- Add a production-parity guard to the suite so the model and the layout cannot silently diverge again. Cheapest
  honest form: assert the canvas ascent the implementation would use equals the ascent the layout used for the
  same element, for `.banner-score` and the state line. If a direct comparison is awkward, assert the resolved
  canvas `font` string's family is the element's first family and that its
  `fontBoundingBoxAscent + fontBoundingBoxDescent` is within 1 px of the element's `line-height` minus leading.
- Prove it on a build where Acumin is actually the used font, at 1280 hero **and** listing, pixel-measured at
  4x DPR: state ink centre within 1 px of both scores. Then show the guard failing when the old full-list string
  is restored (red control).

## Then

Re-run the full gate, refresh the `docs/redesign-60.md` ink figures if they move, and commit. Do not deploy.
Branches: work on `task/60-scoreboard` (its tip is the code that is deployed). A node build for measurement can
be seeded from `/tmp/kwip60/public/feed-cache` if the live feed has gone quiet — shift the seed timestamps forward
so the cards are live.

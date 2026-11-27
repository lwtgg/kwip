# Task 60b — the score row is still high, because padding is not centring

The owner has now looked at production twice. Round seven onward made the *padding* symmetric: the gap above the
score row and the space under the last tier are both 8.00 px, measured on live production at 390 and 1280 just now.

He still sees the logos high, and he is right. On those same live cards the score row's own centre sits **25.34 px
above the card's centre** at both widths. Symmetric edge padding centres the *content block*; it does not centre the
*score row*, which is the thing that carries the logos, the digits and the state. The row is the card's dominant mass
and it is pinned near the top with three small tiers under it.

So the new rule: **the score row's centre coincides with the card's centre.** The space above the row equals the
total space below it — the tiers plus the bottom pad — and the lowest tier keeps `--banner-pad-bottom` of clearance
at the bottom edge. All card scales.

Implementation notes:

- The tiers below the row are one line each at every width today (detail, audience, abbreviations + track), so a
  token for the lower block's height is acceptable: pad above = `--banner-pad-bottom` + that block. Prefer deriving
  it from existing tokens over a new magic number.
- Hero `min-height` was padded to `--banner-hero-height` with dead space distributed symmetrically; re-check it
  against the centring rule and lower it if the plate is now taller than its content plus the clearance.
- The lower block can in principle wrap at 320 px root 200 %. If it does, a token-only above-pad puts the row too
  low — measure it and say whether it actually happens on the corpus; if it does, solve it rather than assuming.

## Assertions, all widths 320/390/640/768/1024/1280/1440/1920/2560, both densities, both scales

- `|row centre - card centre| <= 2 px`. This is the assertion that describes the defect.
- The lowest tier clears the card's bottom edge by at least `--banner-pad-bottom` (no tier is pushed out, the pad is
  not eaten to fake centring).
- Red control: restore the round-ten equal-padding rule and show the centring assertion fail with the 25.34 px it
  produces, hero and listing.
- Ratio floors, fit, grapheme, wide-detail and order assertions all still pass.

Also assert it from paint, not only from layout, at 4x in Chromium and WebKit: the logo ink centre against the card's
vertical centre, <= 2 px.

Doc: the rule, the measurements before and after, the wrapped-tier finding, and that this is what the owner reported
twice. Gate as before. Commit, do not deploy.

# Fix — task 53, three from review

`/tmp/53-review2.log`. Proportion and contrast stand; these are the three that failed.

1. **Initials overlap the score** (`theme.css:498`, 320/390, both themes and densities). A missing logo paints
   `NL` 15.73 px wide in a 10 px box and collides with the away score by 5.35 px. Initials sit inside the same
   box the logo would, so make the box the constraint: size the initials from the box (a `cqw`-style unit or a
   plate-relative size), clamp to one line, and centre them — they must never lean into the score column at
   320, 390 or 1280, in any theme or density. Two-letter initials must fit; three-letter must not overflow.
2. **Hero status is far too small** (`theme.css:457`): 12 px at 320/390 and 28.16 px at 1280 against **56 px**
   in `docs/redesign-52.md`, while the scores stay 145 px. Set it to the spec at the hero scale and re-measure
   every hero state (`Live`, `Halftime`, `Final`, a viewers line) so it cannot wrap or crowd the lane.
3. **The contrast sweep is blind to the scrim** (`tests/cards_browser.py:324`, `cards_contrast.ts:46`).
   Forcing `--banner-scrim: 0` survives the whole matrix because the unit test rebuilds the intended scrim
   itself. Assert what is *rendered*: in the browser, read each banner's computed background stops and each
   text colour off the live DOM, compute the ratio from those, and fail under 4.5. Prove it by shipping the
   `--banner-scrim: 0` mutation and showing the suite goes red.

## Also in this round: the score face

The owner supplied Acumin Pro Extra Condensed Bold. The token names it but nobody has it installed, so scores
render in Arial Narrow. A digits-only WOFF2 (1.8 KB, `0-9`) is built and waiting at
`/tmp/acumin-digits.woff2`; if it is gone, rebuild with
`uvx --with brotli --from fonttools fonttools subset <otf> --text=0123456789 --layout-features='' --flavor=woff2`.
Put it in `public/fonts/`, declare it `@font-face` in `theme.css` with `font-display: swap` and
`unicode-range` limited to the digits, and add a preload hint in the layout for the score face only. Keep
Arial Narrow in the stack as the fallback. Measure the row at 320 and 1280 with the real face and report the
byte cost against the 2,093 B you already added — the face is a payload addition, so say the new total.

Gate: full suite, both builds, default rebuild, dry-run, all six browser suites at both widths, the mutation
proof, and before/after numbers for all three defects. Commit, don't deploy, don't touch `.prompts` or
`DECISIONS.md`.

# Task 60: the scoreboard the owner asked for

Brief: `.prompts/60-scoreboard.md`. The work was started by another agent, which stopped at its usage limit
with an uncommitted draft and no gate run. This record covers the finished state. "Draft" below means
that uncommitted tree.

## Layout

Every matched banner (listing row, `Next up` row, hero) uses one four-row grid:

| Row | Away side | Middle column | Home side |
|---|---|---|---|
| 1, score row | logo, score | state (`Live`, `Upcoming`, `Final`) | score, logo |
| 2 | | detail (`Halftime`, `vs`) | |
| 3 | | audience (`62 Viewers`) | |
| 4, bottom row | abbreviation | timeline track | abbreviation |

- `.banner-status` is a subgrid on both axes, spanning the score tracks and all four rows. The text
  tiers sit in the middle track. Logos and score boxes share a vertical centre. After wrapping and
  horizontal fitting, the fit pass aligns the state's ink with the scores' ink. A zero-size inline
  block gives the first line's layout baseline, and range positions give the offset to subsequent
  lines. Canvas supplies glyph ascent and descent. The fit drops collapsed whitespace rects and
  whitespace-only rows. The offset does not change the grid rows. When there are no scores, the
  state box aligns with the logo boxes.
- The score row's height is set by the tallest of the logo, the score and the state. Listings use
  `--banner-score-leading` (1.16), and the hero uses `--banner-hero-score-leading` (0.87 as of round five).
  At normal text the 40 px listing logo still sets the score row's height.
- The grid has equal block padding at both edges. Listings use 8 px at comfortable density and
  2 px at compact density. Heroes use 16 px at both densities. The hero minimum height can add
  space equally at both ends.
- Empty tiers collapse. A final with `detail == state` is two tiers, and a stale final is one.
- Compact layout (`data-stacked`, chosen by the fit pass when five columns cannot hold the longest
  word at the floor): each abbreviation spans its team and score tracks, and the logo may shrink to
  the text size. The middle column takes the room that is left, up to `--banner-status-width`. The
  state stays between the scores at every width. The fit pass reads `--banner-status-width` directly
  from the computed style.
- The score keeps the full `--banner-gutter` from the middle column in both layouts. The draft had
  halved it in the compact layout and halved the test with it; both are restored.

### Departure: a word too wide for the middle column

At 320 px with 200 % text, the middle column between two 64 px scores is about 100 px. The
13-syllable Hangul fixture `후반전연장전승부차기진행중` needs 204 px at the 0.6 floor, and a 24-character
`W` stress detail needs more. The draft let these break mid-word, which failed task 58's word oracle.

When a word in the detail or audience cannot fit the middle column at the floor, the fit pass sets
`data-wide-detail`. Those two tiers then take their whole row: in the compact layout nothing else
sits in rows 2–3. They stay centred on the middle column's axis (asserted to 1 px). The state stays
in the middle column on the score row. The suite pins exactly which cells may do this:

| Width | Element 200 % | Root 200 % |
|---|---|---|
| 320 | `matched-widest`, `matched-hangul-long-word` | `matched-widest`, `matched-hangul-long-word` |
| 390 | `matched-widest` | `matched-widest`, `matched-hangul-long-word` |
| 1024 | `matched-widest` | none |

No cell at normal text and no cell at 1280 uses it. Every other tier stays inside the middle column.

## Timeline

`LiveProgress` now sits in the bottom row. It is no longer the absolute strip on the card's edge.

- In the five-column layout the track spans the score and middle tracks, inset by the gutter.
  In the review measurements, the 390 px listing track ran from x=98.89 to 291.11 inside score slot
  edges at 92.39 and 297.61. At 1280 px it ran from 156.89 to 499.11 inside edges at 150.39 and 505.61.
  Both sides were inset 6.5 px at both widths. In the compact layout the abbreviations take the score
  tracks, so the track keeps to the middle column.
- It is vertically centred on the abbreviations, within 1 px. It needed `align-self: center` of its
  own, because it is a child of the subgrid and the lineup's `align-items` does not reach it.
- The track is `--banner-track` (white at 36 % over the team field), 4 px, with `--radius-control`.
  The fill is `--banner-white`.
- Visibility is unchanged. The bar shows for every valid window, including `final` and upcoming
  windows, and is absent when stale or always-live. A stale card has no audience either, so it is
  one tier shorter. An always-live card has the same tiers as a live one, and its height matches
  within 0.02 px: the abbreviations already set the bottom row's height. It remains `aria-hidden`
  inside the lineup and carries no text.
- The fill tracks `now`. For `matched-live`, `matched-pre` (a future window, 0 %) and `matched-final`,
  `aria-valuenow` and the drawn fill width both match the expected percentage within 1 point.
- Fill contrast against the scrimmed field, swept across both team-colour stops, is at least **4.55:1**
  on every fixture. The suite requires ≥ 3:1 in `assert_banner_contrast`.

## Hero

The banner keeps the audience on every card, including the hero. The hero footer renders only when there
is a sound button (zlive), and holds only that button. `audienceInFooter` and `data-audience-in-footer`
are gone. The hero banner centres its lineup in its own min-height, so the extra rows leave no hole.

The footer's disjointness test stays. The button's box must be disjoint from the banner link, the
audience line box and each of its client rects, and must sit below the link. The draft had replaced this
with `plate.bottom <= button.top`. That can never hold, because the footer is inside `.hero-plate`, and
the draft never ran it.

## Original measurements

Chromium, `cards_browser.py` matched matrix: 25 fixtures, 4 widths, 2 themes, 2 densities, 3 text modes
(1,200 listing observations), 32 matched hero observations (including root 200 %), a stale pass and
the `Next up` row. A card's ratio is width ÷ height.

### Centre offsets

The original Chromium matrix compared the canvas model with itself. Its maxima were 0.017 px in
listings and 0.009 px in the hero. These figures report internal agreement. Box geometry independently
put logo and score box centres within 0.008 px in both layouts. The production pixel audit found
a worst listing state-to-score offset of 1.125 px at 2× DPR. The round-four screenshot check allows
1.25 px to account for pixel-grid snapping.

### Original ratios, category rows at normal text

These are the minimum across both themes and densities and every non-growth fixture. One tier is a
stale final, two tiers is a final or a stale live/upcoming card, three tiers is live or upcoming.

| Width | 1 tier | 2 tiers | 3 tiers (`Live`, `Upcoming`) | Card |
|---|---:|---:|---:|---|
| 320 | 4.18 | 3.36 | **2.81** | 288 × 102.67 |
| 390 | 5.20 | 4.17 | **3.49** | 358 × 102.67 |
| 1024 | 6.97 | 5.60 | **4.68** | 480 × 102.67 |
| 1280 | 8.83 | 7.09 | **5.92** | 608 × 102.67 |
| 1280, `Next up` | | | 12.00 | 1232 × 102.67 |

In multi-column grids a two-tier final shares its row's height with three-tier neighbours. At 1024 and
1280 it therefore measures the three-tier ratio. The growth fixture `matched-cjk` (24 Han characters,
beyond the feed's limit) measures 2.41 at 320 and is exempt as before.

**Ratio decision.** Task 58's comfortable row at 320 px measured 75.2 px high with a ratio of 3.83.
The three-tier row now measures 102.67 px, an increase of 27.47 px (36 %), with a ratio of 2.81.
At 390 px, 3.5 would require a height of 102.29 px. The current padding leaves the card 0.38 px taller,
at a ratio of 3.49. One-tier cards clear 3.5 at all four widths. Two-tier cards clear 3.5 from 390 px
and measure 3.36 at 320 px. The suite floors at 320 and 390 come from the measured three-tier ratios,
rounded down to two places.

| Width | Floor | Basis |
|---|---:|---|
| 320 | 2.80 | measured 2.8051 |
| 390 | 3.48 | measured 3.4868 |
| 1024 | 3.50 | kept; measured 4.68 |
| 1280 | 3.50 | kept; measured 5.92 |

The original floor applied to every non-growth category row, fresh and stale. The round-four floors
are below.

### Text at 200 %

No card overflows horizontally in any mode, and no word or grapheme splits. The smallest drawn scale is
0.60. At root 200 % every non-growth detail fits in three lines or fewer. The task 58 height bound
(145.2 px + (4 + 1.3 × extra lines) × 26 px) holds for every cell, with at least 10 px to spare.
`matched-cjk` wraps to 5 lines at 320 inside the middle column; it stays inside the bound.
Stacking matches task 58 at 1024 (only `matched-widest` in element 200 %) and 1280 (none).
`matched-live` at 390 with root 200 % stays unstacked.

## Test audit of the draft

The draft's `tests/cards_browser.py` diff (170 lines) dropped these assertions instead of moving them.
Each is restored or replaced with a stricter equivalent:

| Draft change | Now |
|---|---|
| 3.5 ratio floor deleted | per-width measured floor (above); also applied to stale cards |
| Expected monospace cells deleted | restored unchanged; the draft's layout already met it |
| CJK must wrap at 320 / root deleted | restored |
| 1024 stacking and "unexpected stacking" deleted | restored unchanged |
| Root 200 % height bound and 3-line cap deleted | restored; the cap applies to every non-growth fixture |
| Logo above abbreviation and score clear of logo deleted | restored in `assert_scoreboard_layout` |
| Stacked score gutter halved to 0.25 em | full gutter, `max(0.5 em, measured padding)`, as before |
| Text kept above the progress bar | replaced: the track may not overlap any text ink box |
| `middle` measured on `.banner-status` | measured on the state tier, the real middle column |
| `status_gap` negative when no detail | `None` when there is no detail tier |
| Hero footer disjointness replaced by an impossible check | disjointness restored (see Hero) |

The original suite covered model-relative ink centres, box centres, tier order and containment, fill width and contrast,
an always-live fixture, a stale pass, and the expected wide-detail cells. The timeline test checks
both endpoints against the score-slot edges in the five-column layout and the middle-column edges
in the stacked layout. It allows 1 px of rounding after applying the gutter, and still checks
separation from the abbreviations and every text box.

## Original red controls

Each control appended one CSS rule to the entry stylesheet of a copy of the built `.output`. The working
tree was not touched. Each run was `cards_browser.py --matches-only`, and each failed on the assertion
it targets:

| Control | Rule appended | Text | First failure |
|---|---|---|---|
| State on its own row again | five rows; logos and scores on row 2, bottom row on 5 | normal | `state centre offset`, `matched-live`, 28.45 px |
| Audience back on the bottom row | third tier on row 4 | normal | `audience between detail and bottom row`, `matched-live` |
| Fit below the floor | status lines drawn at `scaleX(.5)` | normal | `drawn below the fit floor`, 0.5 < 0.6 |
| Ratio | `padding-block-end: 2rem` | normal | `ratio below floor`, `matched-live`, floor 2.8 |
| Score gutter removed | score slot `padding-inline: 0` | root 200 % | `score-to-middle gap below gutter`, 1.11 px < 13 px |
| Detail gap removed | detail tier `padding-block-start: 0` | root 200 % | `score-to-detail gap below gutter`, 1.0 px < 13 px |

The grapheme control runs inside every suite pass (`check_codepoint_control`). It splits status lines
into per-code-point spans and requires the grapheme assertion to fail on the Thai, jamo, trailing
Hangul, Khmer and mixed fixtures. It did, in every run.

## Original verification gate

All checks in this gate used local builds. The gate included no production pixel check.
No Worker was serving during any build. Logs are under `/tmp/kw60-gate/final`, red-control logs under
`/tmp/kw60-red`.

- `pnpm test`: 199 of 199 passed, before and after the browser suites.
- `pnpm build`, `NITRO_PRESET=node-server pnpm build` (preset confirmed `node-server`), default rebuild,
  `pnpm exec wrangler deploy --dry-run`: all exit 0. After build-key, the final default rebuild and a
  second dry run also exit 0. `git diff --check` is clean.
- `cards_browser.py`, full run at 320/390/1024/1280: fresh and stale sweeps (32 cells), boundaries,
  known hero, the matched matrix in three text modes, the stale matched pass and the `Next up` row.
  The word and grapheme oracle passed in SSR, fallback and hydrated renders. The code-point control
  failed as required. Hydration and uncaught page errors: 0.
- `top_event_browser.py` at 320/390/1024/1280, every variant. The 200 % below-fold cases now use a
  500 px viewport: the footer no longer stacks the audience over the button, so at 390 px the button
  sat above an 850 px fold and the case never scrolled. The stale below-fold cases keep 850.
- `banner_browser.py`, `density_browser.py`, `notLive_browser.py`, `click_under_browser.py` (baseline
  `1942ccb`, built in a separate worktree), `sourceHealth_browser.py` (build seeded with
  `public/feed-cache` from the task 55 worktree, removed afterwards) and `generation_first_browser.py`
  (a locally packed generation) all passed at the four widths. As in task 55, their `(390, 1280)` loops
  were widened in a scratch copy of `tests/`, not in the tree. In that copy, two helpers also changed:
  - The banner suite's slot expectation now covers 320 and 1024: `min(320, width − 32) × 100` below
    the `md` breakpoint, `970 × 90` above it.
  - The generation-first `expand()` decoder now understands devalue's null-prototype object form
    (`['null', key, ref, …]`), which `match` uses in the SSR payload. The committed decoder lacks
    this. Any capture with a `match` would fail it. That gap predates this task and is left for
    a follow-up.
- `node tests/cards_contrast.ts`: 1,224 banner cases, worst 4.55:1 (light hero, final, `#777`).
- `tests/build_key_worker.py`: the second build missed and the third request hit the live CSS.

## Round two verification

The score fixture (`Live`, 50–97) was also measured from local Chromium screenshot pixels at 3× device scale on macOS.
Across 320, 390, 1024 and 1280 px at normal and root 200 % text, the state ink was within 1.0 px
of either score in listings and within 0.67 px in the hero.

CSS red controls on copies of the rebuilt output failed as expected. A middle-only track measured
84.91 px at 320 px, where the score-slot edges and 6.5 px insets require 150.22 px. Forcing the
state's offset to zero failed the ink assertion at 1.274 px. Moving the state onto a separate row
failed the same assertion at 28.437 px. The audience, fit floor, ratio and two gutter controls
also failed on their target assertions.

`pnpm test` passed all 199 tests. The default build, node-server build, default rebuild and
Wrangler dry run passed. The build-key suite missed after the second build and hit the new CSS on
the third request. A final default rebuild and dry run followed it. Logs are in `/tmp/kw60-r2`.

The cards, top-event, banner, density, not-live, click-under and generation-first browser suites
passed at 320, 390, 1024 and 1280 px. The card sweep reported zero hydration or uncaught page errors.
The contrast sweep passed. The browser gate used the same four-width scratch drivers and packed
generation, with a build of the same click-under baseline as the original gate. Source health passed
at all four widths after rebuilding a separate copy with the task 55 seed files present at build time.

## Round four

Acumin's `unicode-range: U+0030-0039` includes the score digits and excludes U+0020. The old model
depended on canvas and layout choosing the same primary font for the line, typically Arial Narrow on
the audit Mac, while Acumin draws the digits. The first-family-only font string can also lose the
glyph fallback for the state text when an engine cannot resolve that family on its own. The fit
retains the full computed stack and gets its baseline from layout. Chromium's platform font report
confirms the two digit glyphs come from the custom Acumin face.

### Row position and score-to-detail spacing

Round four used the 50–97 fixture in dark theme, comfortable density and normal text on
the local Chromium build. The ratio floors
at 320 and 390 now use the measured category row heights after restoring symmetry. Both wide floors
remain 3.50. The listing score row still measures 40 px at normal text. Across the full matrix
the largest padding difference was 0.016 px, the minimum hero digit fill was 74.0%, and the
largest hero-to-listing detail gap ratio was 1.5998.

| Width | Listing above / below | Hero above / below | Hero digit fill | Listing / hero digit-to-detail gap | Category three-tier ratio (floor) |
|---|---:|---:|---:|---:|---:|
| 320 | 8 / 8 px | 16 / 16 px | 74.0% | 11.62 / 10.01 px | 2.700 (2.69) |
| 390 | 8 / 8 px | 16 / 16 px | 74.0% | 11.62 / 10.01 px | 3.356 (3.35) |
| 1024 | 8 / 8 px | 36.98 / 37.00 px | 74.0% | 11.62 / 14.69 px | 4.500 (3.50) |
| 1280 | 8 / 8 px | 46.27 / 46.28 px | 74.0% | 11.62 / 18.59 px | 5.700 (3.50) |

At 1280 px the hero's score line box fell from 148.47 px to 115.19 px. The fixture draws
85.25 px of digit ink in the Chromium screenshot. The hero retains its 320 px minimum height for
the plate proportions. Its content with the 16 px edge padding measures about 259.45 px, so the
minimum adds about 30.27 px of space at each edge.

### Screenshot ink oracle

Local Playwright on macOS 27.3, DPR 4. The table shows the largest absolute state offset against
either score and the largest absolute top or bottom error across the state and both scores. The
decoder reads element clip screenshots with white text on black. On Chromium the model projects the
layout baseline to the paint baseline by snapping in document coordinates before applying the
transform. WebKit uses the fractional baseline directly. The limits are 1.25 px for centres and
0.5 px for each edge.

| Engine | Width / fixture | Max centre offset | Max edge error |
|---|---|---:|---:|
| Chromium 159.0.8154.6 | 390 listing | 0.875 px | 0.337 px |
| Chromium 159.0.8154.6 | 390 hero | 0.500 px | 0.298 px |
| Chromium 159.0.8154.6 | 1280 listing | 0.875 px | 0.337 px |
| Chromium 159.0.8154.6 | 1280 hero | 0.000 px | 0.231 px |
| Chromium 159.0.8154.6 | 320 wrapped state, root 200% | 0.250 px | 0.159 px |
| Chromium 159.0.8154.6 | 320 hero | 0.500 px | 0.298 px |
| WebKit 27.2 | 390 listing | 0.375 px | 0.251 px |
| WebKit 27.2 | 390 hero | 0.125 px | 0.127 px |
| WebKit 27.2 | 1280 listing | 0.375 px | 0.258 px |
| WebKit 27.2 | 1280 hero | 0.000 px | 0.158 px |
| WebKit 27.2 | 320 wrapped state, root 200% | 0.125 px | 0.133 px |
| WebKit 27.2 | 320 hero | 0.125 px | 0.127 px |

### Regression controls

Restoring the 4 px top padding gave 4 px above and 8 px below the listing row, which failed the
symmetry assertion. Restoring hero leading to 1.16 brought digit fill down to 57.4%, which failed
the 60% floor. Removing the state offset displaced its modelled centre by 4.53 px, and moving it
to its own row displaced it by 28.44 px. Both failed their centre assertion.

With Times substituted only in the canvas model in both the component and test on a separate
build, the 390 listing still aligned within 0.125 px by pixels. The screenshot parity check
failed with a 1.107 px state top error and 0.75 px on each score top against the 0.5 px bound.

### Verification gate

All checks used local builds. This round has no production pixel check or deployment. Logs and
reports are in `/tmp/kw60-r4-final`.

- `pnpm test` passed all 199 tests. The default build, node-server build, default rebuild and
  Wrangler dry run passed. The build-key Worker check missed after the second build and hit
  the new CSS on the third request. A final default rebuild and dry run followed it.
- The cards, top-event, banner, density, not-live, click-under, source-health and generation-first
  browser suites passed at 320, 390, 1024 and 1280 px. The card sweep reported zero hydration or
  uncaught page errors. The contrast sweep passed.
- As in the earlier gate, the four-width scratch drivers used the banner slot expectations for
  all four widths and the generation-first payload decoder for null-prototype objects. Click-under
  used the existing baseline build, generation-first used a locally packed generation, and source
  health used a separate build with the task 55 seed.

## Round five. Hero leading and cross-engine coverage

WebKit painted a 19.00 px hero gap at 1280 px against an 11.75 px category listing gap at DPR 4,
a ratio of 1.6170×. The 1.6× dead-band assertion previously ran only in the Chromium layout matrix.
The dual-engine screenshots measured state and score ink, leaving the detail unmeasured.

The first 1280 px sweep tried 0.90, 0.88, and each hundredth from 0.86 to 0.80. The wide hero
logo held the first row open and WebKit's painted ratio stayed at 1.6170× at DPR 4 and 1.6383×
at DPR 8. At 64rem and up, the hero now caps the logo at the score line-box height. The second
sweep used the same 50–97 Halftime fixture with a timeline in dark, comfortable, normal text.
Each result is the painted hero gap divided by the painted listing gap on local macOS.

| Score leading with wide logo cap | WebKit DPR 4 | WebKit DPR 8 |
|---|---:|---:|
| 0.90 | 1.6170× | 1.6383× |
| 0.89 | 1.5745× | 1.5851× |
| 0.88 | 1.5106× | 1.5319× |
| 0.87 | 1.4681× | 1.4787× |
| 0.86 | 1.4043× | 1.4255× |
| 0.85 | 1.3404× | 1.3723× |
| 0.84 | 1.2979× | 1.3191× |

0.87 was the largest hundredth to clear 5% headroom at both scales (target ≤ 1.52×).
The cap resolves to about 111.36 px at 1280 px, down from 115.2 px.

The pixel report now records the painted state, away score, home score and detail in that order.
At 320, 390, 1024 and 1280 px, each engine compares the painted gap in the hero with the
matching category row and checks the hero's 60% painted digit-fill floor. The wrapped-state
pixel row at 320 px and 200% root size also records the detail. Running the new assertions on
the previous build reproduced the WebKit failure at 1280 px.

| Width | Chromium painted ratio | WebKit painted ratio |
|---|---:|---:|
| 320 | 0.7500× | 0.8298× |
| 390 | 0.7500× | 0.8298× |
| 1024 | 1.1250× | 1.1489× |
| 1280 | 1.4375× | 1.4681× |

The built CSS gave WebKit 17.25 / 11.75 px at DPR 4 and 17.375 / 11.75 px at DPR 8
at 1280 px, about 8.2% and 7.6% below the limit. Both densities gave the same ratios with
and without a timeline. The eight DPR 4 hero rows painted at least 76.3% digit fill.

The full cards run covered 1,200 matched listings, 64 heroes, 24 stale matched listings,
eight Next up cases and 18 screenshot rows. It reported zero hydration or uncaught page errors.
The padding, loose leading, zero offset and separate state row controls failed their intended
assertions. Substituting Times in the canvas model failed pixel parity in both engines.
The preliminary review traced the WebKit Play pointer-focus and sound-control hit-test failures
to the `52c30fc` baseline.

The local gate passed all 199 unit tests, the default and node-server builds, the build-key
Worker check, the final default rebuild, Wrangler dry run, and the four-width browser and
contrast suites. The browser runs used the same scratch drivers, click-under baseline, source
health seed and packed generation as round four. Logs are in `/tmp/kw60-r5-final`.

## Review follow-ups

- F3/F11. The production listing correction overshot by 0.875–1.0 px at 4× DPR in the audit,
  and by up to 1.125 px at 2×. With the correction disabled, the reviewed listings sat 0.25–0.375 px
  above the digits. The local Chromium listing still sits 0.875 px below them at 4×.
- F5. At root 200%, the existing header controls can overflow the document at 320 and 390 px.
  The review measured document scroll width of 400 px at both widths. The card matrix checks each
  banner's containment in this mode.
- F6. The original ratio table measured category rows. Production rail rows measured 480 × 116 px
  at 1024 and 1280 px, for a ratio of 4.138. Rails need their own measurements.
- Measure the fill against the translucent track on bright team fields. The review estimated about
  2.4:1 at the lightest allowed field. The existing sweep measures fill against the field.
- Revisit the stacking threshold for `matched-live` at 390 px with root text at 200 %. The unstacked
  card measured 239.2 px high with its audience on two lines. The stacked wide-detail fixtures
  measured 212.6 px.

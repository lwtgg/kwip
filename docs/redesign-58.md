# Task 58: the banner is the whole card

Brief: `.prompts/58-banner-clean.md`; target: the owner's annotated mockup (`Updated Instructions.png`).

## Composition

A matched card (`stream.match`) is now only the `MatchBanner`, full-bleed and square inside the row radius
(`border-radius: inherit`; card and banner radii are asserted equal). The `card-info` column, category, title
sentence, `CardTiming`, UTC and "Watch" are gone from matched cards. `CardTiming` loses its `banner` prop.
Unmatched cards and `PosterFallback` are unchanged.

The standard banner is a three-tier grid (`.banner-lineup`):

| Tier | Content |
|---|---|
| top | state (`Live`, `Upcoming`, `Final`) centred |
| middle | away score, provider detail (`Halftime`), home score; `vs` for a pre game without a full score |
| bottom | away abbreviation, compact viewers (`62 Viewers`), home abbreviation |

Team logos sit on the outer columns above their abbreviation. **Departure from the mockup:** the mockup's bottom row
reads away abbreviation, viewers, home *name* ("Arizona"). The build shows an abbreviation on both sides, for symmetry.
The feed cannot supply the mockup's version anyway: abbreviations are capped at five characters
(`server/utils/snapshot.ts`, `scripts/scoreboard.mjs`), so real data reads `ARIZ`. An empty abbreviation falls back to the
name's initials (`bannerAbbreviation()`), so nothing under a logo is ever blank. Scores use `--font-score` (Acumin Pro Extra
Condensed, bold); all other text is SF Pro, regular weight, `--text-metadata` size. The content (tiers, label) comes from
`matchBannerContent()` in `app/composables/matchBanner.ts`, unit-tested. Every text node shares one fit pass
(`.banner-fit-text`, `--banner-line-fit`). The initials fallback lives in the logo column, so it never enters the score column.

The fit pass measures scores, abbreviations and status words against the actual card width.
Scores share a scale between 0.60 and 0.85. Abbreviations reserve enough width to fit on one
line at 0.60. The status column reserves at least four ems and enough width for its widest
word at the floor. It can use more of the middle at 1024 px to keep a long detail on one line.
Status leading is 1.3.

If the five columns run out of room, logos and scores share the first row, abbreviations sit
under the logos, and the state, detail and audience get full-width tiers below. The score
gutter is 0.5 em horizontally in the five-column layout and vertically before the stacked
status group. A status line can break between words at the floor. Unspaced scripts use
word segmentation, and an exceptionally wide Latin word uses a narrower monospace face.
Initials fit within the logo box.

Accessibility: one link. An `sr-only` heading carries the banner's own content, in its words and order, one sentence each
(`matchBannerContent().label`): matchup (`A 50, B 97`, or `A vs B` before a score exists), state (`Live`/`Upcoming`/`Final`),
detail (not the hidden provider word such as `Scheduled`), then the audience as shown (`123.5k Viewers`) with the exact count
in brackets when it differs. An `sr-only` line carries `Kickoff <UTC>.`. The visual lineup and the progress bar are
`aria-hidden`, so the bar's value no longer leaks into the name. Example: `Colorado State Rams 50, Arizona Wildcats 97.
Live. Halftime. 62 Viewers. Kickoff Tue, 24 Nov 2026 17:50:21 UTC.`

The hero uses the same banner at `data-scale="hero"`; its 768 art/info split is gone and no `CardTiming` is beside it.

Tokens removed with the old composition: `--banner-plate*`, `--banner-score-narrow`, `--banner-team-hero`,
`--banner-logo-narrow`, `--banner-score-compression-narrow`, `--banner-status-leading-hero`,
`--banner-abbreviation-compression`.

## First review pass (c1bbae0)

Row size and ratio (width / height), both themes, the feed-realistic fixtures at normal text:

| Viewport | Density | Row height | Ratio |
|---|---|---|---|
| 320 | comfortable | 75.2 / 76.4 px | 3.83 / 3.77 |
| 320 | compact | 73.2 / 74.4 px | 3.94 / 3.87 |
| 390 | comfortable | 75.2 / 76.4 px | 4.76 / 4.69 |
| 390 | compact | 73.2 / 74.4 px | 4.89 / 4.81 |
| 1280 | comfortable | 75.2 / 76.4 px | 8.09 / 7.96 |
| 1280 | compact | 73.2 / 74.4 px | 8.35 / 8.21 |

The taller height is the pre-game card (`matched-pre`), not the long-status one; scored rows are the shorter height. The
floor of 3.5:1 at 320 holds (worst 3.77, was 3.71). Rows are 2.6 px taller than the first 58 build for scored cards
(72.6 -> 75.2) because of the 1.2 leading, and 1.3 px shorter for pre-game (77.7 -> 76.4). Lowest rendered text contrast
across fixtures: 4.55:1 (floor 4.5). Heights at 200 % text, with the row allowed to grow: 320 up to 324 px (24 `W`s),
390 up to 262 px, 1280 up to 201 px.

### Review fixes, before and after

Probe: both builds, every fixture, 320/390/1280, both themes and densities, drawn scale read from the element's transform.
200 % is the test's text-only doubling.

| # | Measure | Before | After |
|---|---|---|---|
| 1 | Smallest ink gap, score to detail, 320 @ 200 % | 0.31 px (`148` to a 24-character detail); `50` to `Halftime` 1.95 px | 13.6 px (gutter 12 px at 24 px text) |
| 1 | Same, 390 @ 200 % | 1.03 px | 13.8 px |
| 1 | Pre-game tier text boxes at 320 @ 200 % | overlap 1.41 px | clear by 1.2 px |
| 2 | Drawn scale at 320 @ 200 %, worst | 0.35 (24-character detail), 0.44 (`WWWWW`), 0.58 (`7:42 - 2nd Half`) | **0.60 = the floor** for every line; the row grows instead |
| 2 | Drawn scale at normal text, worst | 0.57 (three-digit score) | 0.65 at 320 (24-character detail, unwrapped) |
| 3 | Score centres at 1280 (mockup 38.5 % / 57.6 %) | 26.6 % / 73.4 % | 39.5 % / 60.3 % |
| 3 | Logo size and column | 40 px, 20 % | unchanged |
| 4 | Bottom row | test fixture used `Arizona` | `ARIZ`, `WWWWW`/`MMMMM`, empty abbreviation covered |
| 5 | Accessible name, live | `Colorado State Rams 50, Arizona Wildcats 97, Halftime 123,456 viewers. Kickoff Tue, 24 Nov 2026 17:50:19 UTC 50` | `Colorado State Rams 50, Arizona Wildcats 97. Live. Halftime. 123.5k Viewers (123,456). Kickoff Tue, 24 Nov 2026 17:50:21 UTC.` |
| 5 | Accessible name, pre-game | `... Arizona Wildcats, Scheduled 62 viewers. Kickoff ... UTC 50` | `Colorado State Rams vs Arizona Wildcats. Upcoming. 62 Viewers. Kickoff ... UTC.` |
| 6 | `101` / `99` at 1280 | 0.567 / 0.85 | 0.85 / 0.85 |
| 6 | `108` / `111` at 320 (column is tight) | 0.557 | 0.81, both sides equal |

Floor 0.6; worst drawn scale at 320 / 200 % after the fix: 0.60.

## First review proofs

- `tests/cards_browser.py`, at 320/390/1280, both themes, both densities: no category/title/UTC/"Watch" text in a
  matched card; tiers paint in order; initials stay clear of the scores; ratio floor; hero uses the same rules.
  The fixtures now include a real five-character abbreviation (`ARIZ`), a three-digit score, the feed's maximum
  (24-character detail, `WWWWW`/`MMMMM`), an empty abbreviation, and a wider-than-allowed `W` row.
- Strict where it was lenient: ink boxes may not overlap at all (was a 0.25 px excuse), nothing may sit outside the card,
  each score keeps the gutter from the detail, no fitted line is drawn below the floor (wrapped or not), both scores share
  one scale and only drop below 0.85 when the column is tight, the accessible name must equal the expected sentence
  exactly, and the progress bar is neither exposed nor in the name. At 1280 the score centres must be within 3 / 4 points
  of the mockup.
- 200 % text is now checked on **every** matched fixture (live, pre, three-digit, long, widest, missing and failed logo,
  empty abbreviation, bright, no colour, final), all three widths, both themes and densities.
- Mutation, `CardTiming` back in a matched card (first pass): the suite failed with
  `AssertionError: ('matched card must have no visible UTC', ...)`. Reverted.
- Mutation, gutter removed (`--banner-gutter: 0`): failed with `AssertionError: ('score touches the detail', 'away', ...)`.
  Mutation, the fit ignoring the gutter (`room()` = `clientWidth`): failed with
  `AssertionError: ([0.85, 0.85], 0.828125, ...)` (scores drawn where the gutter is). Both reverted.
- Mutation, fit pass ignoring the floor (floor 0.01 in the component, token left at 0.6): failed with
  `AssertionError: ('drawn below the fit floor', 'tier-1', 0.325581, 0.6)`. Reverted.
- Found while fixing: reduced motion turned the banner's zero-length transitions into 0.01 ms ones, so a layout read right
  after the fit wrote `--banner-score-min` returned the old column widths and some lines were fitted to stale widths. The
  banner's elements now have `transition-property: none`.
- Before/after shots: before from `27ba445`, after from this build (`/tmp/kwip58-before`, `/tmp/kwip58-probe`, not committed).


## Second review pass (515000f comparison)

The matched browser matrix runs 13 fixtures at 320, 390, 1024 and 1280 px in both themes
and densities. Each point has a normal run, a per-element doubling run and a root run
that sets `document.documentElement.style.fontSize` to `200%` and checks that Chromium
resolves the root to 32 px and banner metadata to 26 px. That yields 624 matched listing
observations, including 208 at 200% root text. The two enlarged modes exercise different
constraints because only the root mode also enlarges rem-based geometry.

Each cell compares the clean `515000f` Worker with the corrected Worker in Chromium.
Height ranges cover all 13 fixtures at that point. The last two columns show the narrowest
status track and greatest horizontal ink overflow in the root run. Values are CSS pixels.

| Width | Theme | Density | Normal height | Per-element 200% height | Root 200% height | Root min status | Root max overflow |
|---:|---|---|---:|---:|---:|---:|---:|
| 320 | dark | comfortable | 75.2–76.4 → 75.1–121.2 | 105.6–448.8 → 113.4–256.0 | 179.9–1333.9 → 208.6–276.2 | 0.0 → 224.0 | 30.0 → 0.0 |
| 320 | dark | compact | 73.2–74.4 → 73.1–120.2 | 103.6–446.8 → 111.4–255.0 | 175.9–1329.9 → 206.6–274.2 | 0.0 → 224.0 | 30.0 → 0.0 |
| 320 | light | comfortable | 75.2–76.4 → 75.1–121.2 | 105.6–448.8 → 113.4–256.0 | 179.9–1333.9 → 208.6–276.2 | 0.0 → 224.0 | 30.0 → 0.0 |
| 320 | light | compact | 73.2–74.4 → 73.1–120.2 | 103.6–446.8 → 111.4–255.0 | 175.9–1329.9 → 206.6–274.2 | 0.0 → 224.0 | 30.0 → 0.0 |
| 390 | dark | comfortable | 75.2–76.4 → 75.1–77.8 | 105.6–261.6 → 113.4–256.0 | 152.8–1022.0 → 150.2–276.2 | 24.0 → 105.8 | 0.0 → 0.0 |
| 390 | dark | compact | 73.2–74.4 → 73.1–75.8 | 103.6–259.6 → 111.4–255.0 | 148.8–1018.0 → 146.2–274.2 | 24.0 → 105.8 | 0.0 → 0.0 |
| 390 | light | comfortable | 75.2–76.4 → 75.1–77.8 | 105.6–261.6 → 113.4–256.0 | 152.8–1022.0 → 150.2–276.2 | 24.0 → 105.8 | 0.0 → 0.0 |
| 390 | light | compact | 73.2–74.4 → 73.1–75.8 | 103.6–259.6 → 111.4–255.0 | 148.8–1018.0 → 146.2–274.2 | 24.0 → 105.8 | 0.0 → 0.0 |
| 1024 | dark | comfortable | 75.2–90.0 → 77.8–77.8 | 200.8–324.0 → 143.6–222.2 | 150.4–179.9 → 150.2–155.6 | 143.4 → 143.4 | 0.0 → 0.0 |
| 1024 | dark | compact | 73.2–88.0 → 75.8–75.8 | 198.8–290.8 → 141.6–221.2 | 146.4–175.9 → 146.2–151.6 | 143.4 → 143.4 | 0.0 → 0.0 |
| 1024 | light | comfortable | 75.2–90.0 → 77.8–77.8 | 200.8–324.0 → 143.6–222.2 | 150.4–179.9 → 150.2–155.6 | 143.4 → 143.4 | 0.0 → 0.0 |
| 1024 | light | compact | 73.2–88.0 → 75.8–75.8 | 198.8–290.8 → 141.6–221.2 | 146.4–175.9 → 146.2–151.6 | 143.4 → 143.4 | 0.0 → 0.0 |
| 1280 | dark | comfortable | 75.2–76.4 → 77.8–77.8 | 138.4–200.8 → 143.6–222.2 | 150.4–152.8 → 150.2–155.6 | 184.3 → 184.3 | 0.0 → 0.0 |
| 1280 | dark | compact | 73.2–74.4 → 75.8–75.8 | 136.4–198.8 → 141.6–221.2 | 146.4–148.8 → 146.2–151.6 | 184.3 → 184.3 | 0.0 → 0.0 |
| 1280 | light | comfortable | 75.2–76.4 → 77.8–77.8 | 138.4–200.8 → 143.6–222.2 | 150.4–152.8 → 150.2–155.6 | 184.3 → 184.3 | 0.0 → 0.0 |
| 1280 | light | compact | 73.2–74.4 → 75.8–75.8 | 136.4–198.8 → 141.6–221.2 | 146.4–148.8 → 146.2–151.6 | 184.3 → 184.3 | 0.0 → 0.0 |

| Regression fixture | Before | After |
|---|---|---|
| 320 px, 200% root, Halftime | 834.88 px tall, 8 detail lines, home logo 4 px outside | 242.42 px tall, 1 detail line, 0 px outside |
| 320 px, 200% root, 24-character detail and 999 scores | 1177.94 px tall, 19 detail lines, up to 30 px outside | 242.42 px tall, 1 detail line, 0 px outside |
| 320 px, 200% root, 24 `W`s | 1333.88 px tall, 24 detail lines | 242.42 px tall, 1 detail line |
| 320 px, 200% root, 24 unspaced Han characters and 999 scores | 1333.88 px tall, 24 detail lines | 276.22 px tall, 2 detail lines at segmented boundaries |
| 320 px, 200% per element, long detail and `WWWWW` | 2 abbreviation lines, 324.03 px tall | 1 abbreviation line, 222.19 px tall |
| 1024 px, normal, 24-character detail and 999 scores | 74.23 px status track, 2 detail lines, 0.00 px closest tier clearance | 91.00 px status track, 1 detail line, 8.44 px closest tier clearance |

The fixture comparisons above use dark and comfortable. In this browser the clean 1024 px
tier boxes touch, while the review measured a 0.41 px overlap. The separate `27ba445` build
measured 145.19 px for Halftime at 320 px and 200% root text, with a minimum horizontal
scale of 0.5625. The corrected row trades height for legibility and keeps Halftime on one
line. The root assertions allow the reference height plus four metadata ems for a one-line
detail and one metadata line-height per additional detail line, with a three-line cap.
The minimum measured scale across all corrected points was 0.60. The minimum measured
score-to-status gap was 6.76 px at normal text, 13.37 px with per-element doubling and
13.19 px with root doubling.

- **Root negative control.** The current `--text-mode root` assertions against the original
  Worker stopped at the 320 px Halftime card with the home logo at x=292 and the card edge
  at x=288. Disabling the stacked selectors in a separate copy of the corrected CSS also
  failed the root test. The home logo reached x=396.
- **Gutter negative control.** Setting only `--banner-gutter: 1px` in a copy of the corrected
  CSS caused the measured gap assertion to fail at 2.57 px against a 6.50 px minimum.
- The root check covers the matched card and its viewport containment. The category header
  independently overflows the page at 320 px and 200% root text.
- Per-fixture JSON is in `/tmp/kw58-before/match-report.json` and
  `/tmp/kw58-final/match-report.json`. The latter directory also contains the corrected matrix
  screenshots.

### Verification gate

- `pnpm test` passed all 189 tests. The Cloudflare and node-server presets built, and
  the final Cloudflare rebuild passed `pnpm exec wrangler deploy --dry-run`.
- `banner_browser.py`, `click_under_browser.py`, `density_browser.py`,
  `generation_first_browser.py`, `notLive_browser.py` and `sourceHealth_browser.py` passed.
  The click-under comparison used its documented `1942ccb` baseline. Source health used a
  temporary build with a local seed. Generation-first used a locally packed fixture in
  place of the missing production capture.
- `cards_browser.py` passed the full fresh and stale sweep and the three-mode matched
  matrix. `git diff --check` passed.

## Third review pass (5747136 comparison)

Stacked score tracks reserve half of the 0.5em gutter each, on the two facing edges.
The shared fit subtracts those paddings before scaling either score. The five-column
layout now checks the longest measured word at the 0.60 floor and allows the outer
padding to contract to half its preferred size when the word needs the room.
Logo width comes from the rendered box in CSS pixels.

At 390 px and 200% root text, stacking dropped from **12/13 to 4/13 fixtures**
in each theme and density, or **48/52 to 16/52 observations** in total. The four that
still stack are `matched-long-status`, `matched-final`, `matched-widest` and
`matched-cjk`. In all four theme and density combinations `matched-live` reports
`stacked: false`, with a 58 px status track and one Halftime line. Its comfortable
row fell from 242.42 to 223.19 px.

The stacked assertions now compare the two score edges horizontally and the lowest
abbreviation ink to the first status tier vertically. Both enforce the gutter with
a 0.02 px measurement tolerance. At 320 px and 200% root text the 999/999 clearance
on `matched-long-status` increased from 0.75 to 13.75 px.

| Temporary CSS mutation | First failing assertion at 320 px and 200% root text |
|---|---|
| Set stacked `--banner-stacked-score-gutter: 0px` | `matched-long-status` score-to-score gap 0.75 px against 13.00 px |
| Set `--banner-gutter: 0` on stacked status | `matched-live` abbreviation-to-status gap 3.80 px against 13.00 px |

The server and client use the same character fallback through hydration.
Browsers with `Intl.Segmenter` apply word segmentation after mounting and refit.
Chromium with the constructor disabled before app startup passed all 208 root-text
observations, including a temporary Japanese fixture (`東京都` repeated eight
times). The assertions found zero broken words and preserved the exact tier text.
The browser reported zero hydration and page errors in that run.

The matrix covers 624 matched listing observations and 16 matched heroes. Each
width and mode has 52 listing observations across both themes and densities.

| Text mode | Stacked at 320 / 390 / 1024 / 1280 px | Smallest stacked score gap | Smallest stacked abbreviation-to-status gap |
|---|---|---:|---:|
| Normal | 4 / 0 / 0 / 0 | 46.04 px | 7.39 px |
| Per-element 200% | 12 / 4 / 4 / 0 | 13.99 px | 16.80 px |
| Root 200% | 48 / 16 / 0 / 0 | 13.75 px | 16.80 px |

Only `matched-widest` stacked at normal text, at 320 px. No matched hero stacked.
The listing sweep found zero broken words, zero horizontal card overflow, a minimum
scale of 0.60 and a minimum rendered contrast of 4.55:1. The fixture measurements,
screenshots and mutation logs are under `/tmp/kw58-fix3`.

### Verification gate

- `pnpm test` passed 189 tests. The default Cloudflare build, the
  `NITRO_PRESET=node-server pnpm build` build, the final default rebuild and
  `pnpm exec wrangler deploy --dry-run` all passed.
- `cards_browser.py` passed the fresh and stale sweeps and the full four-width,
  three-mode matched matrix. The standalone matched run, the card contrast sweep
  and the local Worker build-key test also passed.
- The banner, density, not-live and click-under browser suites passed. Click-under
  used the `1942ccb` baseline. Generation-first passed with a locally packed
  generation fixture. Source health passed against a build with the local feed
  seed on retry after a stalled-feed navigation timeout.

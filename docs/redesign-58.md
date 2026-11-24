# Task 58: the banner is the whole card

Brief: `.prompts/58-banner-clean.md`; target: the owner's annotated mockup (`Updated Instructions.png`).

## Composition

A matched card (`stream.match`) is now only the `MatchBanner`, full-bleed and square inside the row radius
(`border-radius: inherit`; card and banner radii are asserted equal). The `card-info` column, category, title
sentence, `CardTiming`, UTC and "Watch" are gone from matched cards. `CardTiming` loses its `banner` prop.
Unmatched cards and `PosterFallback` are unchanged.

The banner is a three-tier grid (`.banner-lineup`):

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

Fit rules (review fixes 1, 2, 3, 6):

- **Gutter.** Each score slot carries `--banner-gutter` (`0.5em`, so it follows the text size) on the side that faces the
  detail. The fit measures the slot's content box, so a score can never be drawn into it.
- **Floor.** `--banner-fit-floor` is 0.6. A fitted line is never drawn narrower; below it the line wraps at the width the
  floor allows and is drawn at the floor, so the row grows in height only. Wrapping can break inside a word
  (`overflow-wrap: anywhere`), so even `WWWWW` or 24 `W`s stay legible. Initials sit in a fixed logo box and are exempt.
- **Scores fit together.** Both scores share one scale, sized for the wider: `min(0.85, column / widest)`, never below the
  floor. `50`/`97` and `101`/`99` therefore draw at the same scale and only shrink when the column is genuinely tight.
  The score columns are `minmax(floor × widest + gutter, 1fr)` (`--banner-score-min`, set by the fit pass), and the team
  and status columns give way first.
- **Wide listing card (`≥ 64rem`).** The status column narrows from 36 % to 16 % and each score hugs the detail. Logos and
  their columns are unchanged.
- The banner's own elements have `transition-property: none`: the fit pass reads layout straight after writing it, and
  reduced motion stretches every zero-length transition to 0.01 ms, which handed those reads the old track sizes.
- `--banner-status-leading` is 1.2 (was 1.1) so the tier text boxes never overlap, including the pre-game card at 200 %.

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

## Measurements (match fixtures, `tests/cards_browser.py`)

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

## Proof

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

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

Team logos sit on the outer columns above their abbreviation. Scores use `--font-score` (Acumin Pro Extra
Condensed, bold); all other text is SF Pro, regular weight, `--text-metadata` size. The content (tiers, label) comes from
`matchBannerContent()` in `app/composables/matchBanner.ts`, unit-tested. Every text node shares one fit pass
(`.banner-fit-text`, `--banner-line-fit`) so a three-digit score or a long detail condenses instead of wrapping or
colliding. The initials fallback lives in the logo column, so it never enters the score column.

Accessibility: one link. An `sr-only` heading carries the full label (teams, scores, detail) and an `sr-only` line
carries exact viewers and the UTC kickoff; the visual lineup is `aria-hidden`.

The hero uses the same banner at `data-scale="hero"`; its 768 art/info split is gone and no `CardTiming` is beside it.

Tokens removed with the old composition: `--banner-plate*`, `--banner-score-narrow`, `--banner-team-hero`,
`--banner-logo-narrow`, `--banner-score-compression-narrow`, `--banner-status-leading-hero`,
`--banner-abbreviation-compression`.

## Measurements (match fixtures, `tests/cards_browser.py`)

Row size and ratio (width / height), both themes:

| Viewport | Density | Row height | Ratio |
|---|---|---|---|
| 320 | comfortable | 72.6 / 77.7 px | 3.97 / 3.71 |
| 320 | compact | 70.6 / 75.7 px | 4.08 / 3.80 |
| 390 | comfortable | 72.6 / 77.7 px | 4.93 / 4.61 |
| 390 | compact | 70.6 / 75.7 px | 5.07 / 4.73 |
| 1280 | comfortable | 72.6 / 77.7 px | 8.38 / 7.82 |
| 1280 | compact | 70.6 / 75.7 px | 8.66 / 8.07 |

The taller height is the long-status fixture. The floor of 3.5:1 at 320 holds (worst 3.71), so the three tiers fit
and no row height change was needed. Lowest rendered text contrast across fixtures: 4.55:1 (floor 4.5).

## Proof

- `tests/cards_browser.py`, at 320/390/1280, both themes, both densities: no category/title/UTC/"Watch" text in a
  matched card; tiers paint in order without overlap and inside the card; initials stay clear of the scores;
  single link keeps the full accessible name; ratio floor; 200% text stays inside the card; hero uses the same rules.
- Mutation: `CardTiming` put back into a matched card made the suite fail with
  `AssertionError: ('matched card must have no visible UTC', 'Started at 17:04 UTC Live CSU 50 Arizona 97 ...')`.
  Reverted.
- Fix found while verifying: at 200% text the fit pass did not rerun (only the lineup was observed), so
  "Arizona" overflowed the card. Each fit element is now observed, and the fit leaves a pixel spare because
  `offsetWidth` rounds down.
- Before/after shots: before from the 57 baseline build, after from this build
  (`/tmp/kwip58-before-shots`, `/tmp/kwip58-shots`, not committed).

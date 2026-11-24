# 51 · The listing becomes the app's row

The owner rejected 50a's look: a tall poster tile with the time stacked under the art reads as a
thumbnail grid with a big number bolted on. This pass starts again from the reference and lets it
win. The Apple Sports card is a short **row**: a contained ground, identity at one edge, the
numeric fact in its own lane at the other, quiet labels, a separate state. Every listing surface
now renders that row. The hero keeps its poster and adopts the same lane.

Skills read: `kwip-conventions`, `tailwind-best-practices`, `frontend-design`, `impeccable`
(context loader, craft floor, detector), `writing-plans`, `webapp-testing`, `kwip-budgets`,
`verification-before-completion`.

## References

The five owner screenshots were read as images before anything was designed. Each line names
the element taken from it, not the whole screen.

| Reference | What was taken |
|---|---|
| `/tmp/kwip49-refs/Apple-Sports-welcome-screen_inline.jpg.large.jpg` | Featured Games: separate rounded charcoal rows split by a thin strip of canvas, so each tinted row gets its own ground. The upcoming MLS row shows `6:30 PM` with a small line under it in the centre lane, which became our time plus quiet status. |
| `/tmp/kwip49-refs/Apple-Sports-HOZ.png` (right screen) | Tinted rows, one per game, each a full-ground field under opaque white numerals; neutral rows beside them. The `LATER TODAY` header is short and sits flush over its rows. |
| `/tmp/kwip49-refs/00cRHdooLpmPK3Fbykdnku4-4..v1741897186.png` (middle and right) | Row proportion: inset roughly equal to the gap between identity and number, rows about five times wider than tall; league label small and muted above the line, team names small beneath. |
| `/tmp/kwip49-refs/13a2c8dfe2286789e5c4694cbab5a4a1.png` | Group headers (`MLB >`, `Men's Tennis >`): one weight, a chevron, no rule, no count competing. Upcoming rows put the time in the centre lane at the same weight as a state such as `Final`. |
| `/tmp/kwip49-refs/Apple-Sports-updates-lp.jpg.landing-big_2x.jpg` (left screen) | The same row survives a different palette and a group label (`Group B`) above the time, so a quiet caption above the number is in-language. |
| <https://developer.apple.com/design/human-interface-guidelines/lists-and-tables> | "A small image in the leading end of a row, followed by a brief explanatory label" is the plate plus identity stack; "the grouped style uses headers, footers, and additional space to separate groups" is the group treatment without extra chrome. |
| <https://lickability.com/blog/apple-sports/> | Score numerals are "a condensed, bold font": kept the 850-weight tabular numerals with `font-stretch: condensed` where the system face supports it, and no bundled font. |
| <https://sixcolors.com/link/2024/04/the-poor-design-of-apple-sports/> (search summary only) | The critique that identity belongs beside the number it qualifies: the plate and name sit in the same row as the time, never above it. |

Searched but not used: App Store listing pages and Apple Support guides (text only, no row
detail), Creative Boom and Basic Apple Guy (no row anatomy).

## Element-by-element translation

| Reference element | kwip row | Notes |
|---|---|---|
| Rounded row ground, small canvas gap | `.card-row`, `--radius-row` 0.75rem, `--row-gap` 0.25rem (0.125rem compact) | Each row keeps its own contrast-gated field: tinted when a seed passes the 50a gate, neutral `surface` otherwise. Neutral rows stay neutral. |
| Crest at the leading edge | Poster plate, 16:9 at `--spacing-row-plate` 6rem (4rem on phones), `--radius-plate` | Uncropped genuine poster or the existing fallback; never a pretend crest. |
| League label above, names below | `.card-category` (metadata size, muted) above `.card-name` (1rem/600, two-line clamp); viewers and `Watch` beneath | Label truncates to one line. Viewer count is tertiary; `Watch` is the subordinate cue and stays inside the one link. |
| Score in its own lane | `.card-lane` at the trailing edge: caption, then time with a small `UTC` unit, then quiet status, then reserved progress | The lane column is `minmax(floor, auto)`. The floor is the measured width of the time, so the lane never changes width between upcoming, live and ended. The name column is `minmax(0, 1fr)`, so the name truncates for the lane, never the reverse. |
| Central game state | Quiet `StatusPill` in the lane: `In 1h 58m`, `Live`, `2h ago` | Short form only in the lane; the accessible label keeps `Upcoming in 1 hour 58 minutes. Starts …`. States without a number (`24/7`, `Ended`, `Replay`, `Time unavailable`, `Unconfirmed`) take the fact slot at label scale, in the height the time would use. |
| Group header with chevron | `GroupHeader.vue`: 1rem/600 title, drawn SVG chevron when the group has a page, muted count | Replaces the 850-weight heading, bottom rule and `→`/`View all` pair on rails, Next up, Upcoming and Related. |
| Grouped list | `.row-grid` (auto-fill columns of at least `--spacing-row-min` 26rem) and `.rail-track` (the existing scroller, now columns of up to three rows at md and up) | Rails keep horizontal scroll, snap and focus gutter. Below md every group is one column of rows. |
| Detail header numbers | Hero keeps the poster and its 7/5 split, and its information block uses the same label / name / meta stack beside a lane at detail scale (3.5rem time, `--spacing-hero-lane` 11.25rem). | Below 28rem the hero name runs full width under the label and lane. |

Lane captions by state: upcoming shows the date (`Nov 24`); live shows `Started at` above the
kickoff; ended shows `Nov 24 · UTC`; replay shows the archive date. Stale rows show `Unconfirmed`
with `Last listed: 05:24`, no status, no progress and no viewer count.

## What compresses, and where

Phones (below 28rem) are where a row breaks first. Measured at 320 px, the row is 288 px wide.

1. The plate shrinks from 6rem to 4rem and moves onto the league label's line.
2. The name runs full width under the plate (140 px at 320, 210 px at 390) instead of sharing a
   line with it (it would get under 90 px). It clamps at two lines.
3. The time drops from 2rem to 1.75rem and the lane floor from 7.5rem to 6.75rem, which still
   holds `05:24 UTC` (104 px measured).
4. The lane never gives way: its text wraps (`Availability unconfirmed`, `Time unavailable`) but
   nothing in it truncates.

Density changes spacing only: row padding, row gap, column gap and the stack gaps. The same
fields, type and structure appear in both densities.

## Layout stability

A right-aligned label that changes length moves its left edge, and Chrome scores that as a
layout shift. Three of the lane's labels change: the status at hydration (`In 2h` on the server,
`In 1h 59m` on the client), the caption at kickoff and the fact at full time. Before the fix this
measured CLS 0.00025 on home at 320 px.

The fix lays the lane out right-to-left (`direction: rtl` on `.card-lane`, the progress bar back
to `ltr`). Chrome measures a box's starting point in its writing direction, so each lane box is
anchored at the trailing edge and its growth never moves its start. A probe confirmed it before
adoption: right-aligned text scored 0.0031, an RTL block scored 0, and so did the exact structures
used (column flex, contained note, reversed fact row). Every lane string begins with a Latin letter
or is digits only, so Unicode bidi rule W7 keeps each one a single left-to-right run.

The floors are measured widths with the system font on macOS Chromium. A platform whose fallback
face sets the time wider than the floor will widen the lane for numeric rows. The test matrix is
Chromium on macOS only; no other engine or OS is claimed.

## Rejected, and why

- **Centred lane, as in the app.** Apple centres the state between two scores. With one identity
  there is no "between", and a centred fact floats away from the edge it belongs to.
  Right-anchored keeps one reading edge down a column of rows.
- **Two inward scores or a mirrored time.** No second identity or score exists; inventing one
  breaks the data-honesty rule.
- **Square crest crop of the poster.** Crops posters into fake logos. The plate keeps 16:9.
- **One shared container with hairlines (inset grouped).** Tinted rows each need their own
  contrast-checked field. A shared container would put several fields in one ground or force every
  row neutral, so separate grounds with a canvas strip it is, as in Featured Games.
- **Three columns at 1280.** At 24rem a row leaves about 115 px for the name. Grids use 26rem
  minimum columns: two at 1280 (608 px rows), one below about 900 px. Rails use 26rem columns.
- **A per-row "Listings may be out of date" note.** On stale pages it doubled row height at 320
  and repeated the page notice on every row. The lane already qualifies each row (`Unconfirmed`,
  `Last listed`), and the page-level stale notice stays.
- **The full status wording in the lane** (`Upcoming in 1h 58m`). It wraps to two lines in a
  6.75rem lane and collapses to one at kickoff, shifting the row. The short form plus full
  accessible label keeps one line.
- **The date on live rows.** `Started at · Nov 24 · UTC` wraps in the lane. A live row shows
  `Started at` over the kickoff, and the progress bar's accessible label carries the exact UTC end.
  An overnight live event therefore shows its kickoff without the day.
- **Container queries.** Rows are never narrower than 26rem at md and up, so one viewport
  breakpoint (28rem) covers the phone case. Container queries would need an extra wrapper on every
  row.

## What stays

One link per card with the whole area active, and an accessible name carrying the full event name,
fact, status and `Watch`. The 50a tint pipeline and contrast gate are unchanged. Also unchanged:
player page, source at the frame edge, banner below the player, selection, ordering and dedupe on
home, and every ad slot position. No dependency, no new route, no image. Tokens live in
`theme.css`.

**Date strip:** the brief says to keep it, but no date strip exists in `app/`. Nothing named, routed
or queried as a date (`?date=`) is in the tree; 49a proposed it and no task built it. Nothing was
removed, and nothing was added.

## Files

- `app/assets/css/theme.css`: row, lane, plate, hero and group tokens; row, lane, hero, row-grid and
  rail-track rules; 50a's `.card-listing` and `.card-scale-hero` rules replaced.
- `app/components/StreamCard.vue`: the row and the hero as one link with plate, identity, lane
  and meta; `layout` prop removed.
- `app/components/CardTiming.vue`: renders the lane (caption, fact, status, progress).
- `app/components/StatusPill.vue`: `quiet` lane form with short text and the full accessible label.
- `app/components/GroupHeader.vue` (new): the one group header.
- `app/components/Rail.vue`: group header and row columns inside the existing scroller.
- `app/components/StateBlock.vue`: loading skeleton in row geometry.
- `app/components/PosterFallback.vue`: initials size from a token, so the fallback fits the plate.
- `app/pages/index.vue`, `app/pages/c/[category].vue`, `app/pages/live/[...uri].vue`: Next up,
  Upcoming, category and Related use row groups and the shared header.
- `tests/cards_browser.py`: lane anatomy assertions (fact at the trailing edge, name never inside
  the lane, plate leads, row at most 160 px) and the short status at the kickoff boundary.

## Verification

Everything below ran on the final committed source, on 23 November 2026, in Chromium on macOS.
Logs are under `/tmp/kwip51-final/`. No deployment.

| Check | Result |
|---|---|
| `pnpm test` | 148 passed, 0 failed |
| `NITRO_PRESET=node-server pnpm build`, then Node smoke on `/`, `/c/basketball`, `/vods` | Passed; HTTP 200 each |
| `pnpm build` (default Worker preset, rebuilt after the Node build) | Passed |
| `pnpm exec wrangler deploy --dry-run --outdir /tmp/kwip51-final-dry` | Passed; 1057.86 KiB, gzip 278.11 KiB; the same 15 `ignored-bare-import` warnings as baseline |
| `tests/density_browser.py` | Passed; compact saves 10–45% of page height, banner and player boxes identical |
| `tests/banner_browser.py`, `tests/notLive_browser.py`, `tests/sourceHealth_browser.py` | Passed |
| `tests/click_under_browser.py` against a pre-task baseline build | Passed; CLS 0 on load and source changes, flag on and off |
| `tests/cards_browser.py` | Passed (details below) |
| `node tests/cards_contrast.ts` | Passed |
| Impeccable `detect --json --changed` | `[]` |
| `git diff --check` | Clean |

**Screenshot matrix** (`/tmp/kwip51-shots/`, 460 PNGs). It covers 320, 390 and 1280 px, dark and
light, comfortable and compact: home, category, `/vods`, an empty group and a stale category,
which is 60 page loads. Measured CLS is **0 on every one**. 612 rendered cards were each asserted
to:

- be one link with no nested control and at least 44 px high;
- carry the full name, fact and `Watch` in their accessible name;
- have the fact at the trailing edge within 1 px;
- keep the name out of the lane;
- lead with the plate;
- stay no taller than 160 px for a row.

Per-row captures on the category page cover two seeds, an unreadable seed, no poster, failed art,
a long name, unknown time, invalid start, invalid end, missing end, a 24/7 channel, ended, no
seeds, bad seeds and scheduled live. Art is delayed 350 ms on purpose. At true 200% text there is
no page or lane overflow. The known-kickoff hero was captured in all 12 combinations with CLS 0
and a mint focus ring. Upcoming → Live → Ended at 390 and 1280 px in both themes measured
**CLS 0 at kickoff and at full time**.

**Contrast.** The whole-field minimums are unchanged from 50a, because the tint maths and bounds
are untouched:

| Field | fg | muted | focus |
|---|---:|---:|---:|
| Dark listing | 10.41 | 5.78 | 7.55 |
| Dark hero | 8.81 | 4.89 | 6.39 |
| Light listing | 13.20 | 5.58 | 6.02 |
| Light hero | 12.12 | 5.12 | 5.52 |

New canvas pairs: group header fg on canvas 16.91 dark and 14.92 light; count and chevron muted on
canvas 9.39 and 6.30. Neutral rows: fg 14.58 and 15.97, muted 8.10 and 6.74. Next up now uses the
listing tint (35%), not the hero tint (50%), like every other row.

**Budget**, compared with a build of the pre-task head in the same environment:

| Measurement | Before | After |
|---|---:|---:|
| Dry-run upload | 1053.27 KiB | 1057.86 KiB (+0.4%) |
| Worker `.mjs` bytes | 717,707 | 722,852 (+0.7%) |
| Client JS gzip | 124,833 B | 126,407 B |
| Client CSS gzip | 7,041 B | 7,382 B |

There is one new client chunk (`GroupHeader`), and the largest chunk is still the 74 kB framework
chunk. No dependency, image or runtime request was added.

A clean worktree without the ignored `.env` and `public/feed-cache/` chunks differently, and its
source maps depend on the build path. That is why 50a's report showed a +28% server directory.
Measured like-for-like, the growth is the figures above.

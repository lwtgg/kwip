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
| <https://lickability.com/blog/apple-sports/> | Score numerals are "a condensed, bold font": kept the 850-weight tabular numerals with `font-stretch: condensed` and no bundled font. See "Condensed numerals" below for what that does and does not deliver. |

Searched but not used: App Store listing pages and Apple Support guides (text only, no row
detail), Creative Boom and Basic Apple Guy (no row anatomy). The 51 fix round read
<https://sixcolors.com/link/2024/04/the-poor-design-of-apple-sports/> in full. It is a short
link post by Jason Snell (12 April 2024) pointing to Dr. Drang's critique of the basketball box
score. It says nothing about row layout, crests, labels, numerals or where identity sits
relative to the score. The earlier citation came from a search summary and did not support the
claim credited to it, so the citation and the claim are both gone.

## Element-by-element translation

| Reference element | kwip row | Notes |
|---|---|---|
| Rounded row ground, small canvas gap | `.card-row`, `--radius-row` 0.75rem, `--row-gap` 0.25rem (0.125rem compact) | Each row keeps its own contrast-gated field: tinted when a seed passes the 50a gate, neutral `surface` otherwise. Neutral rows stay neutral. |
| League label above the row | `.card-category`: its own full-width line across the top of the row, metadata size, muted, one line | When it does not fit, the tag after the dot drops whole before the sport name truncates. "Football · Champions League" (155 px) prints in full at 320. |
| Crest at the leading edge | Poster plate, 16:9 at `--spacing-row-plate` 6rem (3rem below md), `--radius-plate` | Uncropped genuine poster or the existing fallback; never a pretend crest. |
| Names beside the crest | `.card-name` at 1rem/400 `text-fg`, two-line clamp at md and up, one line below md; one quiet meta line under it (viewer count, `Watch`) | Viewer count is tertiary and says `1 viewer`, `2 viewers`. `Watch` is the subordinate cue, muted 400, and stays inside the one link; when the meta line is too narrow it drops whole (it stays in the accessible name). |
| Score in its own lane | `.card-lane` at the trailing edge: caption, then time with a small `UTC` unit, then quiet status | The lane is a fixed column at the floor of its scale (`--spacing-row-lane` 6.75rem), so no state widens it; longer text wraps inside. The name column is `minmax(0, 1fr)`, so the name truncates for the lane, never the reverse. |
| The heavy element | The time, 850, `text-fg`, `--card-time-tracking` -0.02em | The only bold thing in a row. Name, state, status, caption, `UTC`, viewers and `Watch` are 400; everything but the name and the state word is muted. |
| Central game state | Quiet `StatusPill` in the lane, muted 400: `In 1h 58m`, `Live`, `2h ago` | Short form only in the lane; the accessible label keeps `Upcoming in 1 hour 58 minutes. Starts …`. States without a number (`24/7`, `Ended`, `Replay`, `Time unavailable`, `Unconfirmed`) take the fact slot at label scale (metadata size in a row, 1rem in the hero above 28rem), in the height the time would use. |
| Live progress | `.card-lane-bar`, absolutely placed on the row's bottom edge, inset by the row padding | Out of the lane's flow: it adds no band to the row and moves nothing when it appears at kickoff. |
| Group header with chevron | `GroupHeader.vue`: 1rem/600 title, drawn SVG chevron when the group has a page, muted count | Replaces the 850-weight heading, bottom rule and `→`/`View all` pair on rails, Next up, Upcoming and Related. |
| Grouped list | `.row-grid` (auto-fill columns of at least `--spacing-row-min` 26rem), `.row-list` (Next up: one column at every width) and `.rail-track` (the existing scroller, columns of `--spacing-rail-column` 30rem holding up to three rows at md and up) | Rails keep horizontal scroll, snap and focus gutter. Below md every group is one column of rows. |
| Detail header numbers | Hero keeps the poster and its 7/5 split; its information block uses the row's arrangement at detail scale: label on top, name and lane side by side, meta under the name (3.5rem time, `--spacing-hero-lane` 11.25rem) | Below 28rem: 1.25rem name, 2rem time, 7rem lane. The hero name is not clamped. |

Lane captions by state: upcoming shows the date (`Nov 24`); live shows `Started at` above the
kickoff; ended shows `Nov 24 · UTC`; replay shows the archive date. Stale rows show `Unconfirmed`
with `Last listed: 05:24`, no status, no progress and no viewer count. Below md the lane keeps
one note, so the caption gives way to any status or note and shows only when it is the lane's
only line (replay). The status's accessible label still carries the full UTC start or end.

## What compresses, and where

Below md the row is the label line, then one name line and one quiet line beside a two-line
lane. Measured at 320 px, the row is 288 px wide and 80–81 px tall (3.56:1) comfortable, 70–73 px
(3.95:1) compact.

1. The plate shrinks from 6rem to 3rem (48×27). It never set the height; it shrinks for width.
2. The block padding drops to `--row-pad-block-narrow` (0.5rem, 0.375rem compact) and the inline
   padding to 0.75rem (0.5rem); the column gap to 0.5rem (0.375rem).
3. The name is one line: 92 px at 320 and 162 px at 390 comfortable, 104 px and 174 px compact.
   It truncates; the full name is in the link's accessible name.
4. The time drops a step, from 1.75rem to 1.5rem. The lane stays 6.75rem, the same as at md and
   up, because the widest one-line strings set it (see "Lane floors").
5. The lane never gives way: its notes wrap (`Availability unconfirmed`, `Last listed: Time
   unavailable`) but nothing in it truncates. Those rows are one line taller. No row in the live
   feed is.

Density changes spacing only: row padding, row gap, column gap and the stack gaps. The same
fields, type and structure appear in both densities.

## Lane floors

The lane is a fixed column, not `minmax(floor, auto)`, so a long state cannot widen it and
reflow one row. Each floor is the widest one-line lane string at its scale, measured in macOS
Chromium with the system face (lane text is not condensed; only the time is):

| Scale | Strings | Floor |
|---|---|---|
| Row, every width | `Last listed: 23:48` 106 px, `Time unavailable` 101 px (metadata size); `05:24 UTC` 108 px at 1.75rem and 96 px at 1.5rem *at uncondensed width* | 6.75rem (108 px) |
| Hero, 28rem and up | `Time unavailable` 121 px at 1rem; `05:24 UTC` at 3.5rem | 11.25rem (180 px) |
| Hero, below 28rem | `Last listed: 23:48` 106 px, `Time unavailable` 101 px (metadata size); `05:24 UTC` at 2rem | 7rem (112 px) |

The fact row wraps the `UTC` unit under the time before any digit would break, so a wider face
costs a line, not a garbled time.

## Condensed numerals

`font-stretch: condensed` stays on `.card-time`. The 51 review measured it as ignored. Measured
again this round in the same environment (Chromium, macOS, system face), it is **honoured**:
`05:24` at 28px/850 sets 83.9 px normal and 72.7 px condensed, a 13% cut, and the same 13% on
letters. The face Chromium resolves for `-apple-system` carries a width axis.

What it is not: a condensed *design*. It is the system face's own width axis, not Apple Sports'
score face, so the digits stay rounder than the app's. And on any face without a width axis
(the `system-ui` fallback on Windows, Android and Linux), it does nothing: the time sets at
normal width. The only tightening there is `--card-time-tracking` (-0.02em), which applies
everywhere. The lane floors above are sized for the uncondensed time, so the fallback fits.
No other engine or OS was measured.

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

The floors are measured widths with the system font on macOS Chromium, sized so the uncondensed
time still fits. Text wider than a floor wraps inside the lane; it never widens it. The schedule
bar is out of the lane's flow, so its appearance at kickoff moves nothing. The test matrix is
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
  minimum columns: two at 1280 (608 px rows), one below about 900 px. Rails use 30rem columns
  (480 px rows, a 224 px name); 26rem left 148 px and truncated names.
- **A two-column Next up.** Three rows in a two-column grid left one beside an empty 608 px cell.
  Next up is a single column at every width.
- **The label on the plate's line on phones.** It left the label 64 px and cut "Basketball · NBA"
  to "Basketb…". The label owns the full top line at every width.
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

- `app/assets/css/theme.css`: row, lane, plate, hero and group tokens; row, lane, hero, row-grid,
  row-list and rail-track rules; 50a's `.card-listing` and `.card-scale-hero` rules replaced.
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
  the lane in rows or the hero, plate leads, label first and whole, only the time heavy, rows at
  least 3.5:1, the lane reserved for state rows, `1 viewer`) and the short status at the kickoff
  boundary.

## 51 fix round: before and after

The review passed the row's identity and failed its proportion and emphasis. Every number below
was measured in Chromium on macOS: before on a build of `4cb8c4d`, after on the final source.
Both were node-server builds against the same feed cache, plus a fixture feed for the named
labels and the state rows. Logs and screenshots are in `/tmp/kwip51fix/`.

| # | Measurement | Before | After |
|---|---|---|---|
| 1 | Worst row at 320, comfortable / compact (both themes) | 288×136, 2.12:1 / 288×118, 2.44:1 | 288×81, **3.56:1** / 288×73, **3.95:1** |
| 1 | Worst row at 390, comfortable / compact (both themes) | 358×136, 2.63:1 / 358×118, 3.03:1 | 358×81, **4.42:1** / 358×73, **4.90:1** |
| 1 | Bands in a phone row | plate+label, two-line name, meta, four-line lane with the bar | label line; one name line plus one quiet line beside a two-line lane; bar on the bottom edge |
| 2 | League label width at 320, comfortable / compact | 64 / 80 px ("Basketb…", "Football …") | **264 / 272 px**; "Basketball · NBA" and "Football · Champions League" whole |
| 2 | League label width at 390, comfortable / compact | 134 / 150 px ("Champions League" cut) | **334 / 342 px**; both whole |
| 3 | Name column at 320, normal row vs `Time unavailable` row, comfortable (dark and light) | 140 vs 121 px; lane 108 vs 127 px | **92 vs 92 px**; lane 108 vs 108 px |
| 3 | The same, compact (dark and light) | 152 vs 133 px | **104 vs 104 px** |
| 4 | Weight 600+ in a row | name 600, `Watch` 600 fg, status 600 fg, state 600, `UTC` 600, time 850 | **time 850 only**; name and state 400 `text-fg`; `Watch`, status, caption, `UTC` and viewers muted 400 |
| 4 | Single viewer | "1 viewers" | "1 viewer" (text and accessible name) |
| 5 | Time size and tracking, phone row / md+ row / phone hero / hero | 28 / 32 / 44 / 56 px, normal tracking | **24 / 28 / 32 / 56 px**, -0.02em |
| 6 | Phone hero at 390 dark comfortable | 358×433; lane above the label beside an empty block of 78 px (72 compact) | 358×370 with the same event; label first, name beside lane, **no empty block** |
| 7 | "Cincinnati Bengals at Washington Commanders" in the 1280 hero | cut to two lines | **whole, three lines**, no clamp, all four theme/density combinations |
| 8 | Rail rows at 1280: row / name column / lane | 416 / 148 / 120 px; 58 of 402 rendered names truncated | **480 / 224 / 108 px**; 0 of 392 truncated (compact: 240 px name) |
| 9 | Next up at 1280 | two columns, rows 2 + 1 beside an empty 608 px cell | **one column**, 1 + 1 + 1 |
| 10 | Six Colors citation | search summary credited with a claim | read in full; it does not make the claim; citation and claim removed |
| 11 | Row assertion in `tests/cards_browser.py` | height ≤ 160 px | **width:height ≥ 3.5** for every row at every width. A row whose lane note wraps may take one extra 18 px line, and only that. Applied to the old build, it fails every phone row (2.12–3.03:1). |

The test also now asserts the label comes first and prints whole, only the time is heavy, the name
never enters the lane (hero included, at every width), a state row's name column equals a time
row's, and `1 viewer`. The whole new test file run against the old app code fails.

What did not get better, and why:

- **The phone name is short.** At 320 the name column is 92 px comfortable (104 compact), one
  line, so most names truncate ("Colorado…"). Before, the name ran full width on its own line
  (140 px), but that was the band that made the row 2.12:1. The lane (108 px) and the plate (48 px) take the
  rest. At 390 the column is 162 px.
- **`Watch` drops at 320.** In a 92 px meta line, "88 viewers" leaves no room for `Watch`, so it
  drops whole rather than truncating. It stays in the link's accessible name, and the whole row
  is the link. It shows at 390 and up.
- **Two edge rows are one line taller on phones.** `Availability unconfirmed` (129 px) and stale
  `Last listed: Time unavailable` (170 px) wrap inside the 108 px lane: 100 px rows at 320
  comfortable (2.88:1). No row in the live feed is one of these.
- **Next up rows are 1232 px wide at 1280.** One column was the brief's choice. The lane sits at
  the far edge of a long row.

## Verification

Everything below ran on the final source on 23 November 2026, in Chromium on macOS. Logs are
in `/tmp/kwip51fix/final/`. No deployment.

| Check | Result |
|---|---|
| `pnpm test` | 148 passed, 0 failed |
| `NITRO_PRESET=node-server pnpm build`, then Node smoke on `/`, `/c/basketball`, `/vods` | Passed; HTTP 200 each |
| `pnpm build` (default Worker preset, rebuilt last) | Passed |
| `pnpm exec wrangler deploy --dry-run` | Passed; 1058.54 KiB, gzip 278.33 KiB; the same 15 `ignored-bare-import` warnings |
| `tests/cards_browser.py` | Passed: 60 page loads, 612 cards, CLS 0 on every load (details below) |
| `node tests/cards_contrast.ts` | Passed; minimums unchanged |
| `tests/density_browser.py`, `banner_browser.py`, `notLive_browser.py`, `sourceHealth_browser.py` | Passed |
| `tests/click_under_browser.py` against a `1942ccb` baseline build | Passed; CLS 0 with the flag on and off at 390 and 1280 |
| noscript and reduced motion, 320 / 390 / 1280, dark and light, live feed | Rows render with lane 108 px, min ratio 3.56 / 4.42 / 4.14, no label cut, no overflow, no transition or animation in any row or the hero |
| Impeccable `detect --json --changed` | `[]` |
| `git diff --check` | Clean |

**Screenshot matrix** (`/tmp/kwip51fix/final/shots/`, 460 PNGs): 320, 390 and 1280 px, dark and
light, comfortable and compact; home, category, `/vods`, an empty group and a stale category.
Every card was asserted to be one link with no nested control and at least 44 px high, and to
carry its full name, fact and `Watch` in its accessible name. Per-row captures cover the 14
category cases, including failed art with images delayed 350 ms. CLS was 0 on every page load,
at kickoff and at full time (390 and 1280, both themes), and in all 12 known-kickoff hero runs.
The 200% text check passed at 320, 390 and 1280 with no page or lane overflow.

**Contrast.** The tint maths and bounds are unchanged, so the field minimums are the same as 50a:

| Field | fg | muted | focus |
|---|---:|---:|---:|
| Dark listing | 10.41 | 5.78 | 7.55 |
| Dark hero | 8.81 | 4.89 | 6.39 |
| Light listing | 13.20 | 5.58 | 6.02 |
| Light hero | 12.12 | 5.12 | 5.52 |

This round adds no canvas pair. It moves `Watch`, the status and `UTC` from `fg` to `muted` on
the row fields, which the muted column gates (worst 4.89, dark hero). The progress track's
muted border on the same fields is the same pair, above the 3:1 non-text floor.

**Budget**, node-server builds of `4cb8c4d` and the final source in the same environment (gzip -9
per file, summed):

| Measurement | Before | After |
|---|---:|---:|
| Dry-run upload | 1057.86 KiB / 278.11 KiB gzip | 1058.54 KiB / 278.33 KiB gzip |
| Client JS gzip | 126,093 B | 126,329 B (+236 B) |
| Client CSS gzip | 7,313 B | 7,505 B (+192 B) |
| Client JS chunks | 17 | 17 |

`useCardTint.ts` imports `theme.css?raw`, so comments in `theme.css` ship in a client chunk. The
rationale lives in this document, and the CSS comments stay short. No dependency, image, route
or runtime request was added.

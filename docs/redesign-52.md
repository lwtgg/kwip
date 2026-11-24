# 52 — The scoreboard

The owner drew two mockups on 2026-11-24: a top event with a playing stream and a scoreboard beside it, and
three widths of a row that carries the score instead of a thumbnail. This is the spec both build against;
`DECISIONS.md` 24–26 carry the rules.

## What replaces what

- The provider thumbnail (`poster`) is no longer the default art. Every visual is ours: a two-team gradient,
  the two logos, `vs`. Thumbnails stop being fetched; they stay in the feed contract, unread.
- The row's plate becomes the **banner artwork**: away gradient at the left edge, home at the right, logos
  on the outside, scores inside them, and a status column in the middle. The league label, the name and the
  kickoff stay where 51 put them, so the row still reads as a row.
- The hero's tile becomes the **top event**: the same banner on the left, the existing info card on the
  right, and the playing player under the banner.

## Artwork

Three gradient strengths; the colour pair comes from the match, not from a hard-coded table.

| Surface | Left stop | Right stop | Vertical |
|---|---|---|---|
| Hero banner and row plate | away primary, solid to 30 % | home primary, solid from 71 % | darkened 45 % at top and bottom, straight fade to none at the middle |
| Scoreboard beside the top-event player | away primary, solid to 12 % | home primary at 100 % | none |
| Row banner on an unplayed fixture | away, muted ~12 % over `#272624` | home, the same | none |

The muted pair is computed from the team colours, not written by hand: each colour laid over the neutral
base at 12 %, so a green/red fixture reads `#192f23 → #272624 → #361f24`. A missing colour falls back to the
base. Faed logos and failed logos leave the gradient alone.

The row's plate is the artwork and shrinks at 320; the logos keep their explicit box and never squash.

## The row, by width

Five columns: `away logo | away score | status | home score | home logo`. Away is always the left — the side
comes from the feed, never from the fixture name order.

- Status column, three stacked lines: state (`Live`), detail (`Halftime`, `Q3 7:42`, `Final`), viewers
  (`62 viewers`).
- Labels under the logos are the abbreviation, uppercase, quiet. Use the abbreviation on both sides so the
  pair is symmetric; 51's rule that only the numeral is heavy still holds — the scores are the only heavy
  text and they are set in Acumin Pro Extra Condensed, 145 px at hero scale and 78 px at row scale.
- A row without a match keeps today's layout exactly: plate, identity, kickoff lane, no status column.
- The progress bar stays at the bottom edge of every banner, its fill driven by the match window.

## Scale and proportion

- Row, 320 and 390: banner plate `6rem` wide, scores ~2.75 rem, status 0.75 rem. Row height must not grow
  past what 51 measured (81 px at 390) — the score sits inside it.
- Row, 1280: plate `12rem`, scores ~3.5 rem.
- Hero, all widths: banner across the full width of the tile at 16:9 at 320–390 and at the card's own height
  from 768, scores 145 px, status 56 px.
- Long banner (a full-width row): scores 78 px, logos 116 px, status 29 px — the row's scale, not the hero's.

## The top event

- First home slot, only when a live event exists; otherwise the slot shows the soonest kickoff with the
  banner art and no player.
- Live: player mounted under the banner, muted, playing; a `Tap for sound` affordance sits on the frame's
  bottom-left and never on the card's click target.
- The card is still one link to the event page. The player is a sibling target, not nested inside it.

## Type and colour

SF Pro for every label, abbreviation, status line and viewer count. Acumin Pro Extra Condensed is the scores
only, at weight 700. White for the banner text, `#ffffff` at full strength, because the banner ground is
darkened team colour; the muted base keeps 4.5:1, which the contrast sweep must prove on every pairing.

## Measurement record

| Mockup | Row height | Banner | Scores |
|---|---|---|---|
| `New Banner Designs.png`, main banner | 385 px in a 1440 crop | 13 px bar, square corners | 145 px |
| same, long banner | 204 px | 12 px bar, inset 114/72 | 78 px |
| `Top Event design.png`, scoreboard | — | no radius, no overlay | 78 px |

The mockups leave open: rounded or square banner corners, whether the title stays underlined, and the label
field (abbreviation vs short name). Take: square banner corners inside the row (the row's own radius holds the
outer shape), title stays underlined as 51 shipped it, abbreviation on both sides.

# Brief — task 60, the scoreboard the owner actually asked for

The owner reviewed production (58, `b4cba298`) on DAL–DEN and liked it, then named three gaps, and said they apply
to **every matched banner**, not just that one:

1. the timeline at the bottom is missing on live cards — he only saw it once the game reached `Final`,
2. the viewer count must sit below the detail line, not on the bottom row,
3. the logos are too far up and must be centred with the scores.

Correction after measuring production, because the first reading was wrong: the timeline is there and it does
contrast. Live, it is a white fill on a `#272624` track (measured 260 px of 342 on the Oregon card), and the owner
saw it once the DAL–DEN game finished and the bar sat at 302 px of 326. What is wrong is placement and
prominence — it is a 4 px strip pinned to the card's very bottom edge, full-width, inset by the same padding as the
content, so on a live card it merges into the bottom edge and on a finished one it reads as a stray white rule
under the card. That is the bug behind (1): it belongs *inside* the layout as a timeline, between the
abbreviations, not on the border.

## Grid — state between the scores

Owner's second correction: the state belongs **between the logos, centred on the scores**, not on a row above them.
("When an event is finalized, the final should be in between the logos. Centered between the scores.")

- Rows become: scores (logos), detail, audience, then the bottom row (abbreviations, timeline). The state no longer
  has a row of its own: it is the first tier of the middle column and sits **on the score row**.
- The middle column is a four-row subgrid — state, detail, audience, bottom — spanning those rows; state is aligned
  to the score row and vertically centred in it, so the state's centre and the scores' centre agree within **1 px**
  at 320/390/1024/1280 and at 200 % text.
- `.banner-team` must align to the score row: logo centre equals score centre within **1 px** on the same widths and
  text size. Give the logo the same vertical box as the score.
- The state may wrap inside the middle column; if it does, the score row grows and the logos and scores stay
  centred together. It must never push the scores apart or out of the card.
- Nothing moves outside the card, and the 200 % wrapping floor still holds.
- The hero takes the same grid; it has its own min-height and padding, so check that the extra rows do not leave the
  hero banner with a hole or a lost baseline. Wide rows (a 1232 px `Next up` row) use the same grid and must look
  like the design, not like a stretched small card.

## Audience

Move the audience into the detail stack: state, detail, audience, in that order, centred in the middle column.
It is no longer on the bottom row.

## Timeline

- Move `LiveProgress`'s bar out of its absolute bottom-edge strip into the bottom row's middle cell, between the
  two abbreviations, as a flexible track with side gaps, vertically centred in that row.
- Visibility rules stay as they are: the bar is present whenever the window is valid, in every state, and absent
  when stale, always-live, or the window is unusable. Do not hide it on `final` — the owner's own card was `final`
  with its window still running, which is exactly when the bar is doing its job.
- Make it read at a glance: a track the eye can see against a coloured field (a translucent white or a token derived
  from the existing banner inks), a near-white fill, 4 px, rounded. Keep it inside the card.
- No text in the banner (the label already carries the match). Still `aria-hidden` in the banner.
- Its absence must not change the card height by more than the row gap.
- Progress must remain accurate: a wrong `now` moves the fill.

## Ratios

Four text rows become three plus the bottom row, which still makes a three-tier card taller. Measure the ratio at
320/390/1024/1280 for one-, two- and three-tier cards in every state and record it; keep the 3.5 floor only where a
card can still meet it, and set the suite's floor from the measurement instead of inventing one. No card may
overflow horizontally at 200 %.

## Hero interaction

Task 55 is merged by then. Its hero footer currently relocates the audience out of the banner to sit beside the
sound button — remove that relocation so the hero shows the audience in the banner like every other card, and the
footer holds only the button. Keep the footer's disjointness test.

## Tests

- Logo-versus-score centre offset ≤ 1 px, and state-versus-score centre offset ≤ 1 px, per width and at 200 %.
- Order: state on the score row, detail below the scores, audience below the detail; all three inside the middle
  column and inside the card at 320/390.
- Timeline: present for a live window and for an upcoming one, absent for always-live and stale; fill width tracks
  `now`; contrast of fill against the field ≥ 3:1 for both team-colour extremes (add it to the contrast sweep);
  the bar sits between the abbreviations and above the card's bottom edge.
- Both gutter mutations stay red; graphemes stay single; the fit floor holds.
- Red controls: give the state its own row again and show the centre assertion fail; drop the audience back onto the
  bottom row and show the order assertion fail.

## Gate

`pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run, every suite at
320/390/1024/1280. Never build while a Worker serves. Commit, do not deploy, do not touch `.prompts` or
`DECISIONS.md`. Record the measurements in `docs/redesign-60.md`.

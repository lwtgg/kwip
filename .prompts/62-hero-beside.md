# Brief — task 62: the hero player moves beside the plate

Owner, on the shipped 55: "its in the bottom of the banner and its taking up too much space. Should be to the left of
the banner."

Measured: the hero box is 693 px tall inside an 850 px viewport at 1280, and the card is over 1,000 px, so the fold
is almost all player. Rule 28 replaces rule 27's under-the-plate placement.

## Layout

- From `md`, the hero card is two columns: player left, plate right. The grid is roughly half and half with the
  existing card gap; the card is as tall as the taller column.
- The plate stops being full-bleed. It is the right-hand column, keeps the card's radius on its right corners, and
  takes the card's vertical padding. The player is the left column, full-bleed to the card's left corners.
- The player stays a sibling of the link and the link stays the plate, exactly as rule 27 had it. Sound control
  stays in the plate footer.
- Below `md` the card is one column: plate full width, box under it, as rule 27 had it. The box is 16:9 at every
  width.
- The box is reserved at 16:9 from the plate's width in the one-column layout and from its own column in the
  two-column one, so a resize across the breakpoint never changes the plate's height or CLS.

## What this has to fix

- **Fold.** At 1280×850 and 1024×850 a mounted hero must keep the whole player visible above the fold, or the
  plate with the state, scores and the bottom row must be; measure both and record which. The card must no longer
  be taller than the viewport at 1280 when a frame is mounted.
- **The player must not squeeze the banner.** With the plate at half width the state between the logos still fits
  at 1024 with a long status, and at 200 % root; if it cannot, the tier stacks as it does today — the existing
  stacking rules are the fallback, not a redesign.
- Tab order, focus and the Play scroll from 55 all keep working in the new geometry: the button is no longer the
  bottom-most thing in the card, so recheck that a Play tap still brings the player into view and keeps the button
  clear of the sticky header at 844×390, 667×375, 932×430 and 1280×500, plus 320/390 at 200 % (one column there).

## Tests

- At 1024 and 1280: plate and player are side by side (player right edge ≤ plate left edge, plate top ≈ player
  top), the player box is 16:9, the card is not taller than the viewport with a frame mounted.
- At 320 and 390: one column, plate above box, both full width, no overflow at 200 %.
- Crossing the breakpoint by resizing leaves CLS at 0 and does not change the plate height by more than the gap.
- Play scroll and hit-test at the four landscape sizes and the two 200 % portraits, per above.
- Red control: put the box back under the plate and show the fold assertion fail at 1280.

## Gate

`pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run, every suite at
320/390/1024/1280 and `--below-fold-only`. Never build while a Worker serves. Commit, do not deploy, do not touch
`.prompts` or `DECISIONS.md`. Record the measurements in `docs/redesign-62.md`.

## Separately noted, not this task

The owner also reports the hero not playing by itself. The reason is not the layout: every `hero_embed` in the
current feed is taifood, and rule 26 mounts taifood paused because its player ignores our parameters. It has also
stopped serving anything — the embed returns a 225-byte page that only prints "Remove sandbox attributes on the
iframe tag", and its TLS handshake fails from curl. This is not blocking: the owner has said so. Re-measure
taifood playback once their host recovers, and only if their player can start on load revisit rule 26's taifood
clause then. Do not invent a workaround here.

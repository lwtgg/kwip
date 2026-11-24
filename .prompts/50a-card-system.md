# Task 50a: the card system

First half of the Apple Sports pass. Build the card and its tokens; leave ordering, the date strip and the
event page to 50b. Read `docs/redesign-49a.md` in full — the card anatomy, the numeral rules, the tint bounds
and the state table are the spec. Read skills `impeccable`, `kwip-conventions`, `tailwind-best-practices`.

## Tokens

Add the semantic tokens the document names to `theme.css`, no magic values in components: card and detail time
sizes and weight, the label sizes if the document's existing ones are not enough, the art region, and the
per-surface tint strength pair (listing 35/65, hero 50/50). Density keeps changing spacing only — the time
never shrinks.

## Tint

Implement exactly as written: seeds from `colors[0]` then `colors[1]`, `#rgb` or `#rrggbb` only, expanded,
hue preserved, saturation capped 60%, lightness clamped 18–26% dark and 84–92% light, composited over
`surface`. One seed is a uniform field, two are a static left-to-right field. Compute the finished composite
and drop the whole field to neutral `surface` if `fg` or `muted` misses 4.5:1 anywhere on it, including hover
and selected. No browser sampling, no blend-mode text, no animation, opaque numerals.

## Card

Each card stays one link. Reading order: art and complete event name, the large time, date and UTC with
availability, then a textual `Watch` cue at the action edge. Poster in the existing art region with the
existing failed-art fallback, reserved aspect ratio, visible on mobile. Name clamps at two lines with the full
name in the accessible name. The time block reserves 5ch, never clips digits at 320 px or 200% text, and
wraps rather than truncating. States follow the table: large time when known, `Time unavailable` and
`Unconfirmed` in normal type, `24/7`, `Ended`, `Replay`, and `Started at` inside the scheduled window. Live
progress stays, visibly subordinate to the time. No score, no invented clock, no viewer count as the hero
fact.

Hero and next-up cards get the same treatment at the hero scale (50/50 tint, detail time size); rails and
grids keep their rhythm and the listing strength. Token radii, `--card-pad`, `--card-gap`, `--rail-gap`
unchanged.

## Constraints

44 px targets in both densities, focus visible and unclipped in rails, reduced motion, `noscript` untouched,
the player and ad slot untouched, no dependency, no `<video>` change, nothing weakened in the five suites.
Tint is presentational only: a card with no seeds, bad seeds or failing contrast must look deliberate, not
broken.

## Verification

Screenshots at 320/390/1280, both themes, both densities: home, category, `/vods`, a stale card, an empty
group, a card with no poster, a card with two seeds, a card with one unreadable seed, a long event name, an
unknown time and a 24/7 channel. CLS 0 measured at 390 and 1280 in both themes, including failed art.
Computed contrast for every card pair, dark and light, worst-case seeds and the neutral fallback. Then
`pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, `wrangler deploy --dry-run`, all five
browser suites at both widths. Do not deploy, do not touch the ad flag.

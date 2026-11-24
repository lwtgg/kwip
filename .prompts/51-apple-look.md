# Task 51: make the listing actually look like the app

The owner has now looked at the deployed 50a result and rejected the appearance: *"it doesn't look like it
at all."* 50a did the plumbing — tint maths, contrast gate, numeral tokens, state table — and then hung a big
time under a poster card. That is not the reference. Start from the reference again and let it win.

## Look before you design

The five owner screenshots in `/tmp/kwip49-refs/` are the source of truth. Read all of them first, as images.
Then go and find more: Apple Sports press and App Store shots, the current Apple design language for grouped
lists and score rows, how sports scoreboards lay out an identity, a numeric fact and a state. Save every
reference you use as a URL with one line on what you took from it, at the top of `docs/redesign-51.md`. Do not
copy a screenshot wholesale; name the element.

## The gap to close

The app's card is a **row**: a contained ground, identity at an edge, the numeric fact at the opposite edge,
supporting labels small and quiet beneath, the state centred and separate, all inside a short rounded
container with generous inset relative to its height. Ours is a tall poster tile with the same information
stacked bottom-up, so it reads as a thumbnail grid with a big number under it.

`app/components/StreamCard.vue` already has a `layout="listing"` branch that is a two-column grid, and
`.card-listing` in `app/assets/css/theme.css` exists but is barely used. The home listing should become that
row: poster as a compact identifying plate at the leading edge, the name and metadata in the middle, the
time/state as the loudest thing at the trailing edge, the watch cue subordinate. Short rows, not tiles.

Specific work:

1. **Ground and inset.** The row is one contained surface — radius, inset and separation from the reference.
   Neutral rows and tinted rows both occur in the app; use the existing tint and its contrast gate for rows
   that have seeds, and keep neutral rows genuinely neutral. Hairline or gap separation between rows in a
   group, matching how the app groups.
2. **The number lane.** Frame the time as the app frames a score: own lane at the trailing edge, right-aligned
   or centred in its lane, tabular, never competing with the name for width. The name truncates for the lane,
   not the reverse. States sit in the same lane in the state treatment. Keep the sizes from 50a's tokens or
   retune them, but the lane is the change.
3. **Labels.** League/category label small and above or under the name at the reference's scale, not a
   competing heading. Progress and availability quiet beneath.
4. **Grouping.** One group header style, short, over its rows — the app separates leagues this way and we
   already have rails. Make rails read as grouped sections without adding chrome we do not have.
5. **Hero.** The hero keeps the poster and its scale, but it must not look like a different product from the
   rows beneath it. Rework its information block to the same lane logic.
6. **What stays.** Card is one link, whole area activates, accessible name carries the full event name; player
   page, source at the frame edge, banner below the player, date strip, ordering and dedupe untouched; tokens
   only; no dependency; density is spacing-only; nothing added that the feed cannot supply. No score, no
   invented clock.

Density and the mobile 320 px case are where a row card breaks first: decide what compresses and prove it.

## Deliverable

`docs/redesign-51.md` with the references, the element-by-element translation, and what you rejected and why.
Then the implementation on this branch. Screenshots at 320/390/1280, both themes, both densities, for home,
category, `/vods`, a stale row, a row with no poster, a row with two seeds, an unreadable seed, a long name,
an unknown time and a 24/7 channel. Contrast for every pair, CLS 0 measured. Full gate: `pnpm test`,
`pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, `wrangler deploy --dry-run`, all six
`tests/*_browser.py` suites. Do not deploy. Do not touch `DECISIONS.md` or the `.prompts` brief.

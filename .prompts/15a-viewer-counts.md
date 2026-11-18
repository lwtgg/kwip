# Task 15a — P1: viewer counts, dense on cards, exact where there is room

`DESIGN.md` P1 item 9. Formatting only; no layout redesign.

Right now three components carry their own copy of a `formatViewers` function, and none of them tells a screen reader the real number. Dense counts belong on cards, the exact number belongs in the player, and the exact number always belongs in the `aria-label`.

## Behaviour

- New `app/utils/viewers.ts` (Nuxt auto-imports `app/utils`) exporting two named functions:
  - `formatViewersCompact(raw)` — the existing `5.1k` / `1.2m` / `87` rules, unchanged.
  - `formatViewersExact(raw)` — the real number with thousands separators (`12,345`), `0` for garbage or negatives.
  - Both accept `string | number` and never throw.
- Delete the three local copies and import instead: `app/pages/index.vue`, `app/components/StreamCard.vue`, `app/pages/live/[...uri].vue`.
- `StreamCard.vue`: the badge keeps the compact number visually; give the badge `:aria-label="`${exact} ${metricLabel}`"` and mark the glyph and the number `aria-hidden="true"`. Drop the now-redundant `sr-only` word, but keep the `views` word for the `views` metric. Keep it one badge, unchanged geometrically.
- `app/pages/index.vue` hero metric: stays compact visually (`5.1k watching`), exact in an `aria-label="`${exact} watching`"` / `interested`, with the visible text `aria-hidden`.
- `app/pages/live/[...uri].vue` metadata line: exact, e.g. `· 12,345 viewers` (keep the middle dot and the word). It is player metadata, not a dense card.
- Do not change any other number on the page, the ordering, or `viewerCount()` in `index.vue`.

## Rules

- No new dependency. One new util file only.
- Compact output for the current values must be byte-identical to today's, including the trailing `.0` strip.
- `aria-label` must be on an element that is actually exposed (not `aria-hidden`), and no screen reader should read "5.1k" twice.
- Do not touch `app/composables/*`, `server/**`, `StateBlock.vue`, the logo/favicon, or the shield control.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, a card badge announces the exact number while showing `5.1k`, the player metadata shows the exact number, and the home hero announces the exact number. Reply with files, outcomes, and what you checked.

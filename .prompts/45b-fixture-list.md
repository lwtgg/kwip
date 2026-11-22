# Task 45b: rebuild the surface as a fixture list

45a audited the rendered site (19 findings, critique 25/40) and wrote two directions. The owner chose
**Fixture list**: rows with a fixed time or status column, sentence-case matchups, poster optional on the
trailing edge, one strong action. Featured match is a normal row, not a hero. The selected source is
identified against the player frame.

Read `PRODUCT.md`, `docs/redesign-45a.md` (findings, Direction A, the constraint table),
`app/assets/css/theme.css`, `app/pages/index.vue`, `app/pages/live/[...uri].vue`, `app/pages/c/[category].vue`,
`app/pages/vods/*`, `app/components/*`, `DESIGN.md`, and the `impeccable` (`new-work`, `craft-floor`),
`unslop`, `unslop-ui`, `kwip-conventions` and `tailwind-best-practices` skills. This is a rebuild: delete
the broadcast-listing treatment rather than layering on it.

## The system

1. **Font.** Remove `--font-display` and every condensed/uppercase/tracked display use. One family:
   `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`, with
   `font-optical-sizing: auto` and normal tracking. Numerals are tabular SF, not a separate mono face
   except where the player timecode needs it. Headings are sentence case, weight and size carry hierarchy.
2. **Tokens.** Replace the palette with Direction A's Touchline ramp, roles kept as the existing token API
   (canvas/surface/raised/ink/muted/divider/control-edge/action/on-action mapped onto the current names),
   both themes from the table. New geometry tokens: 4/8/12/16/24/32 spacing, 8 px controls, 12 px panels.
   One shadow token for transient overlays only. Keep every value in `theme.css`.
3. **Remove** the scanline texture, `listing-*` utilities, the 3 px radius, and the exposed edge rules.
   Canvas and surface tone do the grouping, a neutral hairline separates rows and groups.
4. **Rows.** Home, category, live window, archive and the "next up" group share one row grammar: fixed
   left column with time or status, sentence-case matchup with a bounded wrap, optional trailing poster
   that can vanish without moving anything, one leading action on the featured live row. 60 px compact,
   76 px comfortable nominal, growing for a wrapped name. Archive swaps the start time for a replay date.
5. **One bright element.** Mint `action` fill on the featured live row's action, and on the actionable
   source or the recovery action. Live is a plain direct label, not a dot plus uppercase plus edge.
6. **Player.** Single panel: frame, then the selected source identified against the frame edge, then
   alternatives, then a lower-weight group with fullscreen, Shield and help. The banner stays below the
   panel at its reserved size. 44 px minimum targets everywhere, including compact density.
7. **Discovery.** Sport links at 390 must show they scroll, and the archive gets a real route in the
   header or a visible control, not a footer-only path. One arrow convention for every destination cue.

## Findings to clear on the way through (from 45a)

- Stale banner says five minutes while `useFeedFreshness` triggers at 20; align the wording to the real
  rule and put freshness beside availability.
- Empty category needs its own action back to current listings; its glyph must not read as loading.
- Feed error keeps Retry, explains the failure in directory terms, and stops leaking upstream copy.
- Selected source gets the frame-edge treatment; stop relying on an underline alone.
- Dedupe the repeated host line when the display hint already equals it.
- Breadcrumb must not repeat the matchup directly above the heading.
- One cue, not `View all (1)` plus an arrow on "More Basketball".
- Viewer counts: one treatment per meaning, tabular; keep the compact/exact split with the exact number
  in the accessible name.
- Drop the archive "EVENT" badge; keep feed-backed category and availability.

## Constraints

- Tokens only; no magic values in components. No dependency, no proxy, no `<video>` change.
- Ad slot: same reserved dimensions, below the player, still functional behind `runtimeConfig.public.ads`
  and with an ad blocker. `#ads` copy stays true.
- CLS 0 at both widths, both themes, posters present, absent and slow.
- AA contrast on every text, hover, focus and control pair; visible focus; keyboard order; `noscript`
  select fallback; reduced motion; light not worse than dark.
- Keep every existing test green without weakening an assertion. Update fixtures only where the markup
  legitimately changed, and say which.
- Copy stays sentence case, no exclamation marks, no "streaming" or "piracy".

## Verification

- Before/after and final screenshots at 390 and 1280, both themes, both densities, on home, live window,
  event with a loaded frame, `/vods`, replay detail, a populated category, an empty category, stale and
  feed-error, with and without posters. `/tmp` paths quoted.
- CLS measured on home and event, both widths and themes, still 0.
- Contrast table for every new pair, computed, not asserted.
- `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, `wrangler deploy --dry-run`, and all
  five browser suites at both widths.
- A short report: what replaced what, what you deleted, and anything the direction got wrong in practice.

Do not deploy and do not touch the ad flag. Never run `wrangler dev` while a build writes `.output/`.

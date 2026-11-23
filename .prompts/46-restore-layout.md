# Task 46: put the broadcast layout back, on the new theme

The owner used the fixture-list rebuild and wants the previous layout back: it was more intuitive.
Keep the **new theme** — the Touchline palette, the refined dark ramp, SF only. Drop the fixture list's
layout and row grammar.

Target state = the broadcast-listing layout from `03b2e5f` (the task 44 merge), restyled to the current
theme. Read `docs/redesign-45a.md` for the palette table; `PRODUCT.md` still applies.

## Order of work

1. Branch `task/46-restore-layout` off `main`. `git revert -m 1 937df1e` and resolve conflicts by keeping
   the pre-45b version of the layout: `app/pages/index.vue`, `app/pages/live/[...uri].vue`,
   `app/pages/c/[category].vue`, `app/pages/vods/*`, `app/components/{StreamCard,Rail,PlayerFrame,SourceSelect,StateBlock,StatusPill,LiveProgress,AdSlot}.vue`,
   `app/layouts/default.vue`, `app/app.vue`. Restore `app/components/PosterFallback.vue`. Keep
   `PRODUCT.md` and `docs/`.
2. Keep the tests as they are where they still describe behaviour; restore the pre-45b versions of the
   browser suites only where the markup change makes the selector wrong. Say which.
3. **Re-apply the theme.** In `theme.css`: the Touchline palette from `docs/redesign-45a.md` (both themes,
   the refined dark values already in git history at `e79cfe0`), `--font-sans` as the SF stack, and
   `--font-display: var(--font-sans)` so nothing renders condensed. Sentence case everywhere; strip
   `text-transform: uppercase` and the tight tracking from `listing-display`, keep its weight for
   headings. Radius: 6 px for cards and controls, 8 px panels. Keep the hairline rules, drop the
   scanline texture. Keep the one-accent rule: mint for the primary action, the live rule and focus
   only.
4. **Carry these 45b fixes across**, since they are behaviour, not layout:
   - stale availability qualification on home, category and event, and no live countdown while stale;
   - host line dedupe in the picker;
   - the JS-off source submit requires a choice, and arrow traversal follows displayed order;
   - focused rail links scroll fully into view with their outline;
   - 44 px targets in both densities, including skip link and toolbar;
   - the empty-state glyph that does not read as loading, plus its action back to current listings;
   - feed errors explained in directory terms with Retry kept;
   - banner back at the break under the featured block, below the player on event pages, at reserved size.

## Restyle notes for the restored layout

- Card and hero backgrounds use `surface`; grouping comes from surface tone and hairlines, not from
  borders on everything. Poster-less cards keep the gradient-plus-monogram fallback.
- The hero is a full card again; its title is sentence case at the large display size, and its live rule
  is the only accent in it besides the action.
- Chips keep the frame-edge identity pattern from the fixture list: selected source against the player,
  alternatives under it, fullscreen/Shield/help in the lower group.
- The "next up" strip stays, as a row of compact cards.

## Constraints

Tokens only, no dependency, no proxy, no `<video>` change, CLS 0, AA, focus visible, reduced motion,
`noscript` select, ad slot dimensions and position, density switch still spacing-only. Nothing weakened
in the tests.

## Verification

Screenshots at 390 and 1280, both themes, both densities, on home, live window, event, player, `/vods`,
replay, populated category, empty category, stale and error. CLS 0 at both widths and themes. Contrast
computed for every pair. `pnpm test`, both preset builds, `wrangler deploy --dry-run`, all five browser
suites at both widths. Report what came back and what stayed gone.

Do not deploy, do not touch the ad flag.

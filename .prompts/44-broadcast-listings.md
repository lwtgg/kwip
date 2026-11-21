# Task 44: art direction — broadcast listings

ROADMAP §5 says the mechanics were fixed and the look is still generic: default type scale, evenly
rounded cards, one accent doing every job, no editorial hierarchy, no texture. DESIGN.md's P0 list is
mostly shipped, so this is no longer an item list — it is a direction, applied.

Chosen direction: **broadcast listings.** The page should read like a broadcast schedule or a
teletext-era score service that happens to be modern: condensed display type, hairline rules, mono
numerals for every time and count, sharp or barely-rounded surfaces, one accent reserved for action and
nothing else. Urgency comes from typographic weight and a live rule, never from colour soup or glow.

Read `DESIGN.md`, `app/assets/css/theme.css`, `app/pages/index.vue`,
`app/pages/live/[...uri].vue`, `app/components/*`, and the `kwip-conventions` and
`tailwind-best-practices` skills under `.agents/skills/`. Read `frontend-design` for the craft bar.

## Direction, concretely

1. **Type does the hierarchy.** Introduce display and numeric tokens in `theme.css` and use them: a
   condensed or tightly-tracked uppercase display face for section headings, event names in cards, and
   the hero; `ui-monospace`/tabular figures for kickoff times, clocks, viewer counts, progress. Body
   copy stays the system sans. No font files and no dependency: a system condensed stack with a sane
   fallback is the ceiling unless one already ships.
2. **Rules, not boxes.** Replace card borders and heavy radii with a hairline rule system: a top or
   left rule per row/card, section headers underlined by a rule, dividers between list groups. Radius
   drops to a small token value; nothing stays a pill except status.
3. **One accent.** Accent stays for the primary action, the live rule and focus. Everything else is
   fg/muted/surface. Status colours are allowed only inside `StatusPill`.
4. **Density stays honest.** The compact/comfortable switch must still work and still be a difference
   of spacing, not of information.
5. **Texture, cheaply.** A CSS-only background detail — a hairline grid or a scanline — in the shell or
   the hero only, never over text, and off when printing or when the OS asks for less motion.
6. **Empty and error states read designed.** CSS-only glyphs at the existing `StateBlock` sizes, with
   the same copy, rather than a paragraph in a box.

## Also in scope (DESIGN.md P1 leftovers)

7. **Hero secondary strip.** Three compact "next up" entries on a hairline divider under the hero, so
   the front page has somewhere to go when nothing is live. Reuse the rail/card primitives, do not add a
   second card style.
8. **Player shield control.** A per-source toggle that reloads the frame with
   `sandbox="allow-scripts allow-same-origin allow-presentation"`, one line of explanation, remembered
   per source name in `localStorage`, and never the default. It must respect the click-under and the
   session failure memory.
9. **Viewer and time formatting** get the mono treatment with exact numbers in the accessible name.

## Constraints

- Tokens in `theme.css` only; no magic colour, radius or spacing values in components.
- Dark first and light never worse. Run both through the density and theme suites.
- Reduced motion respected; no movement beyond the progress bar that already exists.
- CLS stays 0 and the banner keeps its reserved dimensions and position below the player.
- `noscript`/select fallback and the ad path keep working. No new dependency, no proxy, no `<video>`.
- Keep every existing test green without weakening an assertion.

## Verification

- Before/after screenshots at 390 and 1280 px, both themes, on `/`, an event page, `/vods`, and an empty
  category, in `/tmp`; say what changed and why in one short table.
- CLS measured on the event page and the front page, both widths, still 0.
- `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, `wrangler deploy --dry-run`, and all
  five browser suites.
- An accessibility pass over the changed surfaces: focus visible everywhere, contrast on every new
  token pair, headings still ordered.

Report the screenshot paths, the CLS numbers, the token diff and what you deliberately left alone. Do not
deploy and do not touch the ad flag.

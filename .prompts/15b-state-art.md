# Task 15b — P1: empty and error glyphs in StateBlock

`DESIGN.md` P1 item 10. `app/components/StateBlock.vue` only, presentation only.

The empty and error states are bare paragraphs. Give them a small drawn glyph so they read as designed states instead of stray text. Build the glyphs from CSS (borders, pseudo-elements, transforms) — no new asset files, no SVG components, no library.

## Behaviour

- `error` variant: a circled slash — a 28 px circle with a diagonal bar through it, drawn in muted border colour with the bar in accent. Render it above the message text in the text column, `aria-hidden="true"`. Keep the existing `role="alert"`, copy, layout and Retry button.
- `empty` variant: an hourglass — 36 px, two triangles and a waist, drawn with borders in muted, `aria-hidden="true"`, centred above the message. Keep `role="status"`, padding, and copy.
- Both glyphs are decorative only: nothing new enters the accessibility tree, and the message text stays the accessible content.
- Respect `prefers-reduced-motion` if you animate anything (a slow hourglass tilt is welcome but optional; nothing may loop faster than 4 s).
- Keep the mobile behaviour: no horizontal overflow at 390 px, and the error card still stacks below `sm`.

## Rules

- No new dependency, no new file, no new props, no copy changes.
- Leave the `skeleton` and `stale` variants exactly as they are.
- Do not touch any page, `app/composables/*`, `server/**`, or the logo/favicon.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, `/live/nonexistent/x/y` still renders the error state with the glyph and Retry, a filtered page with no matches renders the empty state with its glyph, both are vertically tidy at 390 px, and the accessibility tree contains no extra nodes. Reply with files, outcomes, and what you checked.

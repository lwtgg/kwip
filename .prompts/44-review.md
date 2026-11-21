# Review: broadcast-listings art direction (task 44)

Review branch `task/44-art-direction` against `.prompts/44-broadcast-listings.md`. Do not edit files.
Verdict plus numbered defects.

The direction is not the question; execution is. Judge these:

1. **Tokens only.** Every new colour, radius, spacing or type value lives in `theme.css` and is consumed
   through a token. No arbitrary `text-[13px]`-style one-offs except genuine single-use geometry. The
   diff of `theme.css` is small, named by purpose and usable in both themes.
2. **Type does the hierarchy.** Display and numeric tokens are real and applied: condensed or tracked
   uppercase headings, mono/tabular for every time, clock, count and progress, sans for body. Check both
   that it reads as a listing and that the fallback stack holds on a font-less system.
3. **Rules, not boxes.** Cards and rows are separated by hairlines, radius dropped to the small token,
   pills only where `StatusPill` lives. Nothing became a bordered box again.
4. **One accent.** Accent only on primary action, live rule and focus. Status colour only inside
   `StatusPill`. Count the places accent appears and say where each is justified.
5. **Light is not worse.** Walk every changed surface in light, not just dark: contrast on muted text,
   rules, hairline grid, poster fallback.
6. **Density still honest.** Compact and comfortable still differ in spacing only; no information is
   dropped in compact.
7. **Texture stays cheap.** CSS-only, shell or hero only, never over text, off under reduced motion and
   print.
8. **States read designed.** `StateBlock` glyphs are CSS-only at existing sizes with unchanged copy.
9. **P1 scope.** Hero secondary strip reuses existing primitives and hairline rhythm; the player shield is
   per source, remembered by source name, never the default, respects click-under and the session failure
   memory, and explains itself in one line.
10. **Nothing weakened.** No test assertion relaxed; `noscript`/select fallback, ad slot reserved size and
    position, CLS 0, keyboard order and focus visibility all still hold.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

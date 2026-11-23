# Review: restored broadcast layout on the new theme (task 46)

Review branch `task/46-restore-layout` against `.prompts/46-restore-layout.md`. Do not edit files. Judge
the rendered result at 390 and 1280 in both themes and both densities.

1. **Layout is the old one.** Home: hero card, next-up strip, live and 24/7 rails, category rail. Event:
   breadcrumb, title, player with the selected source at the frame edge, alternatives below, secondary
   group last. `/vods` and replay detail carry their earlier card grammar. Nothing from the fixture-list
   row system survives where it would fight it.
2. **Theme is the new one.** Touchline values per theme and role in `theme.css`; SF only; `--font-display`
   resolves to the sans stack; no uppercase or tight tracking anywhere; 6 px controls and cards, 8 px
   panels; hairlines kept, scanline gone.
3. **Accent discipline.** Mint only for primary action, live rule and focus. Count the uses and name the
   exceptions.
4. **Behaviour fixes survived.** Walk the brief's item 4 one by one: stale qualification and suppressed
   countdown, host dedupe, JS-off submit requiring a choice, arrow order following display, focused rail
   links scrolled into view, 44 px targets in compact too, non-loading empty glyph with its action,
   directory-terms feed error with Retry, banner position and reserved size.
5. **Craft.** Check for the old problems returning: chips distinguishable only by underline in light,
   competing live markers, clipped titles at 390, starved text columns, shadow soup, arbitrary values.
6. **Constraints.** CLS 0 measured at both widths and themes; contrast computed for every new pair, AA;
   `noscript` select; reduced motion; poster fallback with monogram; ad slot untouched; light not worse.
7. **Tests.** Nothing weakened. For every changed suite selector, say whether it is legitimate or a
   cop-out.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`,
with surface, width and theme as evidence.

# Review: fixture-list rebuild (task 45b)

Review branch `task/45-redesign` against `.prompts/45b-fixture-list.md`, `docs/redesign-45a.md` Direction A
and `PRODUCT.md`. Do not edit files. Judge the rendered result, not the diff alone: build it, open every
captured surface at 390 and 1280 in both themes and both densities, and look.

1. **Font is SF only.** No condensed or uppercase display face survives anywhere; `--font-display` is gone;
   headings are sentence case; tracking is normal; `font-optical-sizing: auto` is present; tabular
   numerals where numbers are compared. Check that long team names wrap without losing the time column.
2. **Ramp fidelity.** The theme values match Direction A's Touchline table per theme and role, and every
   colour in components is a token. Flag any value that drifted and any role mapped to the wrong meaning.
3. **Row grammar.** Home, live window, category, archive and the next-up group share one grammar with the
   fixed time/status column, bounded matchup wrap and a poster that vanishes without shifting anything.
   Nominal heights are 60/76 and density changes spacing only.
4. **One bright element.** The action fill appears on the featured row's action and on the actionable
   source or recovery action. Live is a direct label, not dot + uppercase + edge. Count the accent uses
   and name any that are not one of those.
5. **Player identity.** Selected source is identified against the frame edge and persists; alternatives sit
   after it; fullscreen, Shield and help are a lower-weight group. Banner stays below the panel at the
   reserved size.
6. **Findings cleared.** Walk the 45a list: stale wording matches the 20-minute rule and freshness sits by
   availability; empty category has an action and a non-loading glyph; feed error explains in directory
   terms and does not leak upstream copy; host line deduped; breadcrumb not repeating the heading; one
   destination cue; one viewer-count treatment per meaning; archive badge gone.
7. **Discovery.** Sport links at 390 read as scrollable, and the archive is reachable without the footer.
   Tab through and confirm focus order and focus visibility.
8. **Craft floor.** Run impeccable's bans and `unslop` signs: no glow, gradient text, emoji labels,
   decorative numbering, gratuitous pills, uneven spacing, arbitrary values, or shadow soup.
9. **Constraints.** CLS 0 measured at both widths and themes; contrast computed for every new pair, AA;
   44 px targets in compact as well as comfortable; `noscript` select; reduced motion; light not worse.
   Ad slot dimensions, position and ad-blocker independence unchanged.
10. **Tests.** Nothing weakened. For each changed fixture or assertion, say whether the change is
    legitimate or a cop-out.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.
Quote the evidence for every subjective call: which surface, which width, which theme.

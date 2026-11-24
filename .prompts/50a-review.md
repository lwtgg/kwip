# Review: the card system (50a)

Review `task/50a-cards` (commit `442f2d7`) against `.prompts/50a-card-system.md` and
`docs/redesign-49a.md`. This is a visual system built from screenshots, so judge the rendered result:
320, 390 and 1280, both themes, both densities. Do not edit files.

1. **The card still is one link.** No nested buttons, the whole card activates, the accessible name carries
   the full event name even when clamped, and the `Watch` cue is inside the link.
2. **Emphasis.** The time or state is the numeral fact at the specified sizes and weight; the poster is
   kept, never cropped into a pretend crest and never demoted to desktop decoration; the reading order is
   art and name, time, date/UTC and availability, cue. Confirm the hero and next-up get the hero scale while
   rails keep the listing strength.
3. **Tint.** Read the algorithm: seeds only from `colors[0]` then `colors[1]`, format-validated, hue kept,
   saturation capped, lightness clamped per theme, 35/65 listing and 50/50 hero, static, opaque numerals.
   The critical rule: **any** contrast failure across the finished field, including interpolated points and
   hover/selected, drops the whole card to neutral. Verify with a failing seed and with none.
4. **Honesty.** No score, no invented clock, `24/7`, `Ended`, `Replay`, `Time unavailable` and `Unconfirmed`
   in normal type and wrapping, `Started at` inside the scheduled window, progress subordinate to the time.
5. **Density.** Spacing only — same fields, structure, art, ordering and ≥44 px targets in compact.
6. **Craft.** Tokens only, no arbitrary values, no dependency, radii and pad/gap tokens unchanged, focus
   visible and unclipped inside rails, reduced motion, `noscript`, player and ad slot untouched.
7. **Measured evidence.** CLS 0 at 390 and 1280 both themes including failed art; contrast computed for every
   pair worst-case and neutral fallback; 320 px and 200 % text without clipping.
8. **Tests.** Nothing weakened. The new suite and unit tests assert behaviour and would fail if their guard
   were removed. Account for the 148 count.
9. **Budget.** The Worker directory grew 28 % while gzip grew 5.4 %. Say whether that is source maps only and
   acceptable under `kwip-budgets`.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`,
each with width, theme, density and the measurement as evidence.

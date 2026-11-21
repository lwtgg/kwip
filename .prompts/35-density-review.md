# Review: density control (task 35)

Review branch `task/35-density` against `.prompts/35-density-control.md`. Do not edit files. Verdict plus numbered defects.

## Check

1. **Compact is felt where it matters.** Measure document height in both modes at 390 and 1280 on an event page, a VOD page, the homepage and a category page. The event and VOD pages must move by about a tenth, not one percent. A category page at 0 is still a fail.
2. **Controls and media do not shrink.** 44 px mobile targets, the player box and any banner box are identical in both modes.
3. **The glyph no longer reads as a menu** and the state is still announced: `aria-pressed`, a label that follows state, a `title` that names the action.
4. **Tokens only, and they mean density.** No magic numbers in components, one comment saying the pair is density, and the pair is not a second name for page padding if it is also used as vertical air (call it if it is muddled).
5. **Comfortable is not silently re-tuned.** Comfortable must be the same rhythm as before the branch on the pages it touched, within a few pixels; a comfortable layout that also got tighter is a defect.
6. Persistence and no hydration flash; all suites and the new density suite pass.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

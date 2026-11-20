# Review: degraded sources (task 32)

Review the branch `task/32-degraded-sources` against `.prompts/32-degraded-sources.md` and `DECISIONS.md` rule 22. Do not edit files. Verdict plus numbered defects.

## Check

1. **Only observations are recorded.** A failure is written on the error path and nothing else. A source that loaded once must not gain an entry, or every source slowly becomes "Failed".
2. **Storage discipline.** Key is per event and versioned; entry expires after 30 minutes at both boundaries; newest 8 keys only; malformed JSON, wrong types and a throwing `sessionStorage` degrade to the feature being absent with no console error. Reads do not mutate.
3. **One badge, correct precedence.** A remembered failure shows ` · Failed` and `, Failed to load`, is muted, and stays selectable. It never renders alongside ` · Not live`. Check contrast and that the label is the chip's accessible name, not the host text.
4. **Selection, not order.** Remembered keys are in `failedKeys` before the initial pick, so a revisit does not land on a dead source; chip order is untouched after mount. An explicit `?source=` still wins. Test the revisit path for real, not by assertion.
5. **Retry clears.** Selecting the failed chip deletes the entry and remounts; failing again re-records. Both retry buttons clear the event's entry.
6. **SSR and hydration.** Storage read is client-only, mismatch is declared where the badge can appear late, and the no-JS `noscript` path is unchanged.
7. **Nothing else moves.** `nextPlayableKey`, chain exhaustion, focus holding and the click-under cap behave as before; the existing Playwright suites are unmodified and pass.
8. **No dependency, tokens only**, and the badge is not a second heading or a second status pill.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

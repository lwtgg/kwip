# Review: click-under (task 30, `03edf9c`)

Review the committed diff against `.prompts/30-click-under.md` and `DECISIONS.md` rule 22. Do not edit files. Verdict plus numbered defects.

## Check

1. **The gesture is intact.** `window.open` must be called synchronously in the click handler before any await, and must not be called twice. Say whether a popup blocker can eat it and whether any path opens without a user gesture.
2. **The stream always wins.** The page loads whether the tab opens, the destination is unset, the request fails, the storage is unavailable or an ad blocker kills everything. No click becomes a dead end.
3. **Placement eligibility** matches the brief: live or upcoming timed events, not 24/7, not the already-selected chip, one per session. Check the session cap cannot be consumed by a failed open.
4. **`/go/<placement>`** is uncached, `no-store`, 302s to configuration, and falls back safely on missing or hostile values. Check the handler is registered in a way that survives the Workers build, and that `preset: node-server` still works.
5. **Edge cache correctness.** The key change adding `ads=1` — prove no page can be served under the wrong mode, including a flag flip while cached entries exist.
6. **The claim is true.** The accessible name says what the click does before it happens, and it stops saying it once the cap is spent.
7. Flag default off, no new client dependency, no render-blocking cost, and the badge/behaviour reads correctly at 390 px.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

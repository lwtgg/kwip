# Review: missing-event 404 (task 36)

Review branch `task/36-missing-404` against `.prompts/36-missing-event-404.md` and rule 20. Do not edit files. Verdict plus numbered defects.

## Check

1. **A readable snapshot that omits the entry 404s** on `/live/<uri>` and `/vods/<slug>`, proven against a real readable generation, not by reading code.
2. **An unreadable generation does not**, and still renders 200: stalled R2 with both upstreams stalled must not turn a present event into a 404, and the seed/stale path must still serve.
3. The decision is expressed once, not duplicated in two pages with the same boolean.
4. The hydration guard for omitted entries still behaves.
5. Nothing else changed: healthy pages, banners, click-under and source health unaffected.
6. Tests cover both directions and all suites pass.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

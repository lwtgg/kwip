# Review: Not live chip coverage (task 40)

Review branch `task/40-not-live-chip` against `.prompts/40-not-live-chip.md`. Do not edit files.
Verdict plus numbered defects. Read `verification-before-completion` first.

## Check

1. **Only the offline variant is labelled.** The suite must fail if a live or unknown variant gets the chip,
   and if an all-live payload yields a status.
2. **Selectable and linked.** A not-live chip keeps its status, stays in the picker, and selecting it sets
   its embed URL and `aria-pressed`.
3. **Status failure is unknown, not dead.** A 404 on the status endpoint leaves every variant listed and
   selectable, page 200, no error surface.
4. **Failover and ranking.** `live: false` is demoted only inside its own quality and locale run, after
   degraded, before viewers; unknown liveness ranks with live; nothing crosses a band; a not-live source
   still stays listed. Check the unit test proves the boundaries and the browser suite proves failover
   skips a not-live equal-quality variant.
5. **Test-only where it should be, and honest.** The status endpoints are intercepted, not hit; no new
   dependency; no change beyond the ranking comparator and the suites; both widths; no console errors
   hidden by a blanket assertion.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

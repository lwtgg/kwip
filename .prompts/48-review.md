# Review: feed watchdog alerting (task 48)

Review branch `task/48-watchdog` against `.prompts/48-feed-watchdog.md` and rule 21. Do not edit files. This
is the alarm for a stopped refresh, so the failure modes matter more than the happy path.

1. **What pages.** Confirm the thresholds: only past the 15-minute grace, and only on sustained failure —
   45-minute manifest age over consecutive ticks, `decision: 'stalled'`, a dispatch rejected twice, dead or
   expired credentials, a paused workflow. Walk each one and say what actually fires.
2. **What stays quiet.** A single provider 5xx, a normal dispatch, a deliberate hold in `backoff.json`, and
   the first 15 minutes of staleness must all be silent. Prove the hold case especially — the Worker did not
   read `backoff.json` before this, so check the read is real and correctly placed.
3. **One issue.** The labelled search happens before any create, an open issue is commented rather than
   duplicated, comments are throttled to 30 minutes, and a lost create response does not produce a second
   issue on the next tick. Trace the intent-then-create sequence.
4. **Recovery.** The first healthy tick closes the issue once, with the age, and later healthy ticks do
   nothing.
5. **Best effort.** No alerting failure may change the tick's refresh decision. Every GitHub and R2 failure
   in the alert path logs a fixed reason and returns.
6. **Budget.** Healthy tick: zero extra subrequests. Stale tick: at most five, with the backoff read reused
   instead of repeated. Count them in the code and in the runtime tests.
7. **Scope handling.** A 403 is `missing-issues-scope`, logged once, no retry that tick. README requires both
   scopes.
8. **Tests.** Unit and workerd coverage for every transition and every budget claim. Nothing in an existing
   test weakened. Check that a passing test would actually fail if its guard were removed.
9. **Craft.** No dependency, site build untouched, `worker-cron check` green, commit message covers the
   behaviour.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`,
with the command that demonstrated each.

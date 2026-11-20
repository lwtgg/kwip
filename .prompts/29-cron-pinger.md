# Task 29: cron pinger that dispatches the refresh

GitHub's scheduler has never fired for this repo. Zero `schedule` events exist, including for a
throwaway `*/5` probe with no logic in it: enabled permissions, both workflows `active`, Actions green
for everything else. Manual dispatch works, so this is the scheduler and not our YAML.

We cannot wait on it. Build the trigger outside GitHub.

## Shape

A separate Worker, `worker-cron/`, deployed on its own cron trigger (`*/5 * * * *`), that dispatches
`feed-refresh.yml` when the feed is actually stale. It carries no request path: no fetch handler serving
traffic, no route in front of the site.

Each invocation:

1. Read `current.json` from the R2 bucket (reuse the publisher's `.r2-credentials.json` shape; the
   credentials become Worker secrets).
2. Take `listsVerifiedAt`. Dispatch only when it is missing or older than **12 minutes** — under the
   15-minute cadence, so a healthy feed never dispatches and a broken one is caught inside two cycles.
3. Before dispatching, ask GitHub whether a refresh is already queued or running (one API call). If one
   is, skip. A dispatch that fails is logged and retried on the next tick; never throw an unhandled
   rejection that loses the tick.
4. Dispatch `feed-refresh.yml` on `main` with `workflow_dispatch`.

## Rules

- A GitHub token with `actions: write` on `lwtgg/kwip` only. Fine-grained and repo-scoped; stored with
  `wrangler secret put`, never in a file that gets committed.
- Budget: keep it to the free Worker tier — five cron ticks an hour, two subrequests each, no bindings
  we do not already use. State lives in R2, not in a new KV namespace unless you prove a binding is
  cheaper than reusing the bucket.
- Idempotent: two ticks that both see staleness must not produce two concurrent publishes. The workflow
  already serialises with `cancel-in-progress: false`, so a duplicate dispatch queues rather than
  collides — say so rather than adding a lock we do not need.
- **Do not** disable or delete the GitHub `schedule:` trigger. If GitHub's scheduler recovers, both
  paths converge on the same workflow and the alerting still runs. Duplicate dispatches are acceptable;
  silence is not.
- Log a one-line structured record per tick: age, decision, dispatch result. Wrangler tail must be
  enough to tell a skip from a failure.
- The pinger is a *trigger*, not a monitor. Do not move freshness thresholds, `--check-freshness` or
  alerting into it; issue state stays the workflow's business.
- Add `worker-cron` to whatever CI check chain the repo has, and a README section covering the secret,
  the cron cadence and how to pause it.

## Verify

- Unit-test the decision function against: missing manifest, 11 min, 12 min, 13 min, a queued run and a
  running run.
- Prove a dispatch is skipped while a run is queued.
- `wrangler deploy --dry-run` in `worker-cron/`, plus the root build and test suite.
- Confirm the deployed cron actually fires (`wrangler tail`) and leaves `listsVerifiedAt` advancing —
  this is the acceptance test, not the dry run.

Stay in `CONTRACT.md` scope; `worker-cron/` is yours, `scripts/` and `.github/` are read-only for you.

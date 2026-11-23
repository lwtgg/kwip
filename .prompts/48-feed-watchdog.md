# Task 48: page the owner when the refresh actually stops

Rule 21 makes `kwip-feed-cron` the only scheduler: it reads the manifest age and dispatches the publish
workflow. It already counts unresolved ticks and can answer `stalled`, but nothing reaches a human. If the
cron stops, the token expires, or the repo's Actions pause, the directory quietly serves an old generation
until someone notices. Close that.

Read `worker-cron/index.mjs`, `worker-cron/index.test.mjs`, `worker-cron/workerd.test.mjs`, README's
"freshness" provisioning section, `docs/freshness-design.md` §failure handling, and rule 21.

## What pages and what does not

Page on sustained, human-fixable conditions:

- manifest age beyond a hard ceiling (45 minutes) on consecutive ticks — not on one miss;
- `decision: 'stalled'` reached;
- a dispatch GitHub explicitly rejects twice in a row;
- `invalid-r2-credentials`, `missing-github-token`, or an expired token (401/403);
- the workflow answering `paused` or disabled.

Do not page while a deliberate hold is written to `backoff.json`, and do not page within the first
15 minutes of new staleness. A single provider 5xx is normal and must stay silent.

## How it pages

Open one GitHub issue on `lwtgg/kwip`, labelled `feed-stale`, title `Feed refresh stalled`, body carrying
the reason, manifest age, last generation id, the reservation key and the run URL when there is one. One
open issue is the state: if it already exists, comment at most once per 30 minutes, never open a second.
On the first healthy tick afterwards, close it with one line saying the age and what recovered.

Track alert state in R2 alongside the reservation (its own key, same bucket) so a container restart neither
double-posts nor loses an open alert. Every alerting call is best-effort: a GitHub or R2 failure there logs
a fixed reason and the tick's refresh outcome is unchanged.

## Budget

A reconciliation tick uses at most four subrequests and a dispatch tick nine. Alerting is budgeted by state:
zero extra on a healthy tick, and at most **five** on a tick whose manifest age is already past the 15-minute
grace, covering the `backoff.json` read, the alert-state read, the labelled-issue search, the one creating
call and the state write. Cache what you can — carry the backoff read from the same tick rather than
re-reading it. Search for the open issue by label with a single request, never by listing issues.

## Scope

`GITHUB_REFRESH_TOKEN` currently carries Actions: Read and write only — opening an issue needs **Issues:
Read and write**. Handle a 403 as `missing-issues-scope`, log it once, and do not retry that tick. Update
README's provisioning step to require both scopes and say the alert is inert until the token is replaced.

## Constraints

No dependency. No change to the site build or its gate. Pure decisions in exported functions with unit
tests (thresholds, hold suppression, one-issue rule, comment throttle, recovery close, budget accounting).
Extend the workerd harness for the GitHub paths; every failure mode above has a test.

## Verification

`pnpm --dir worker-cron check`, its unit and workerd tests, plus `pnpm test`, `pnpm build` and the
`wrangler deploy --dry-run` for the site as regression. Show one simulated run of each state transition
(healthy → stale → alert → still stale → recovery) with the subrequest counts. Do not deploy the site.
Deploy the cron Worker only if you can confirm the token scope; otherwise leave it and say exactly which
command the owner must run.

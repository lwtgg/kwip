# Cron pinger

The scheduled Worker runs every five minutes and requests a feed refresh on
`main` when `current.json` has no `listsVerifiedAt` or the timestamp is more
than twelve minutes old. GitHub's workflow schedule remains enabled.

Each dispatch first claims a conditional reservation in R2. A manifest
timestamp later than the reservation's attempt time clears it, even when
the manifest is stale again. While a reservation is unresolved, the Worker
checks GitHub every tick. It finds the dispatch by its unique workflow run
title and saves the GitHub run ID for subsequent lookups. A completed matching
run or explicit rejection clears the reservation. Empty results and lookup
errors keep it in place. The Worker searches five-minute slices starting one
minute before the attempt to allow for GitHub clock skew, reading one page of up to 100 runs per tick. It narrows a
slice that reaches GitHub's 1,000-result cap, searches the older half first,
then advances through the remaining time. It saves its position and returns
to that starting point after reaching the sweep’s original time horizon so
delayed results can appear. After six consecutive unresolved ticks, including failed GitHub
lookups, it logs `decision: "stalled"` with the reason and keeps checking. A confirmed active run resets the count. On the next stale
tick after a release, the Worker checks every active workflow status before
attempting a new dispatch.

The fifteen-subrequest ceiling in `wrangler.jsonc` is approved for this Worker
on Workers Paid against a budget of 1,000 subrequests per invocation. A
routine healthy tick reads the manifest and alert state.
A reconciliation tick uses at most four subrequests. A dispatch tick uses
nine, with a tenth for the conditional release if GitHub explicitly rejects
the dispatch.

## Recover a stalled or legacy reservation

Use this procedure for a `stalled` record or during rollout if the existing R2
reservation has neither an `attemptId` nor a `runId`. For a legacy
`{ "until": ... }` record, the attempt time is `until` minus 600,000 ms.
Merge the `cron_attempt` workflow input to `main` before deploying a pinger
that sends it.

1. Pause the pinger by deploying `triggers.crons: []` and verify that the
   change has taken effect and all in-flight invocations have finished.
   Using the bucket-scoped R2 credentials with AWS CLI, set
   `R2_ENDPOINT` to the bucket's account S3 endpoint and capture the
   reservation body and its quoted ETag in the same GET. Use a private
   temporary directory for the local files.

   ```sh
   reservation_etag=$(aws s3api get-object --endpoint-url "$R2_ENDPOINT" \
     --bucket kwip-feed-prod --key cron-dispatch-cooldown.json \
     --query ETag --output text reservation.json)
   ```

2. Check `current.json` in R2 and inspect the `feed-refresh.yml` workflow on
   `main` in GitHub Actions. If the record has a `runId`, open that run directly.
   Otherwise, inspect dispatches around the attempt time across all relevant
   pages and look for the exact `Feed refresh (cron <attemptId>)` title. For
   a legacy record, inspect all plausible runs in that interval. Wait for
   any queued or running refresh to finish. If you cannot confirm the
   original run ended or was rejected, perform a supervised manual
   `feed-refresh.yml` dispatch on `main` with the default live inputs after
   verifying the workflow is idle. Wait for it to finish and verify in R2
   that `listsVerifiedAt` advanced past the reserved attempt. An empty
   search or a GitHub error alone is insufficient evidence for clearing.
3. Once verified, overwrite the reservation with a cleared record using
   the ETag of the reservation you inspected.

   ```sh
   jq -n '{clearedAt: (now * 1000 | floor)}' > cleared-reservation.json
   aws s3api put-object --endpoint-url "$R2_ENDPOINT" \
     --bucket kwip-feed-prod --key cron-dispatch-cooldown.json \
     --content-type application/json --body cleared-reservation.json \
     --if-match "$reservation_etag"
   ```

   If the conditional write returns HTTP 412, repeat the inspection using
   the new record and ETag. After clearing, restore the five-minute trigger
   and check the next `feed_refresh_tick` log.


## Watchdog

The cron logs one `feed_refresh_tick` record containing the unchanged refresh
outcome, a separate `alert` result, and `refreshSubrequests`, `alertSubrequests`
and total `subrequests`. Alert errors use fixed reason codes and never include
response bodies, exception text or credentials.

After manifest age exceeds 15 minutes, `backoff.json` is read once. A deliberate
`paused: true`, `hold: true`, or future `retryNotBefore` suppresses notifications.
This key is the watchdog's operator hold; the publisher currently keeps its own
provider backoff in `collector-state.json`. Set the watchdog hold as well when
intentionally pausing publication. A malformed or unreadable hold fails closed.

The watchdog pages on two consecutive observations past 45 minutes, a stalled
reservation, two consecutive explicit dispatch rejections, rejected or missing
credentials, or a paused/disabled workflow. Workflow metadata is checked on a
non-notifying stale tick; a disabled observation is saved for the following tick.
A missing manifest has no trustworthy age: use the existing dispatch reservation
as the first observation and wait until it is over 15 minutes old. An unreadable
or invalid manifest that prevents reading the reservation cannot establish age;
the strict grace budget keeps alerts inert and the refresh error remains in logs. A missing/expired GitHub token
cannot deliver a GitHub issue; the fixed alert error remains in Worker logs.
The `WATCHDOG_STATE` binding accesses the same bucket independently of the S3
secret so malformed or revoked S3 credentials do not disable alert storage.

`cron-feed-alert.json` is separate from the dispatch reservation. A single
labelled search (`repo:lwtgg/kwip is:issue is:open label:feed-stale`) finds an
existing issue, including after an isolate restart. Incomplete searches fail
closed. Notifications use title `Feed refresh stalled`, label `feed-stale`,
manifest age, generation, reservation key and known run URL. Existing issues
receive at most one comment in 30 minutes, with GitHub's `updated_at` used as
an additional throttle when state is lost.

Before create/comment/close, a conditional R2 write reserves the mutation.
Overlapping ticks cannot both create an issue or post a comment. A lost create
response leaves `pendingCreate`; later ticks search rather than creating again.
This also applies to explicit create rejection: it prioritizes no duplicates
within the five-request budget. After correcting the token scope or other
rejection, search GitHub for an open `feed-stale` issue. Only if creation definitely
did not succeed, delete `cron-feed-alert.json` with bucket-scoped credentials to
allow the next sustained failure to retry. Never delete it while a tick is running.
A 403 is reported once that tick as `missing-issues-scope`, with no retry.

Tick state includes the alert lifecycle. A healthy tick has a fresh manifest
and no open, pending, or recovering alert; it spends its normal second read on
alert state instead of the reservation and performs no extra requests or writes.
The next stale tick can still clear any reservation whose manifest advanced.
A fresh manifest with an unresolved alert enters recovery and stays there until
the issue and its durable state are reconciled. Recovery searches and closes the
issue in one PATCH, appending a line with manifest age and what recovered, then
clears alert state. Recovery has a separate budget of at most five extra requests.
An empty search never discards uncertain creation intent: recovery keeps searching
without opening another issue. The next healthy tick again uses zero extras.

Budget (including failed calls): ordinary healthy = two total, zero extra;
13–15-minute stale = refresh only; older stale = at most five extras. The usual
older stale path is backoff read + state read + optional workflow metadata probe
+ state write (four). Create/comment uses backoff read + state read + search +
conditional state write + mutation (five). Recovery uses state read + search +
conditional state write + close + state clear: six total including manifest,
four extra beyond a normal healthy tick (five if a direct lookup is needed
when search temporarily omits a known issue). An explicit dispatch rejection can
still use ten refresh requests, for a maximum of fifteen overall.

Rollout requires a replacement fine-grained token scoped to `lwtgg/kwip` with
both **Actions: Read and write** and **Issues: Read and write**, plus an existing
`feed-stale` label. Do not deploy the site. From the repository root:

```sh
pnpm exec wrangler secret put GITHUB_REFRESH_TOKEN --config worker-cron/wrangler.jsonc
pnpm --dir worker-cron check
pnpm exec wrangler deploy --config worker-cron/wrangler.jsonc
```

The deployed secret's scopes cannot be verified by reading local GitHub CLI
credentials. If the replacement token's scope is unconfirmed, leave the cron
Worker undeployed and have the owner run the commands above after verification.

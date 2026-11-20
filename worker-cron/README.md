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

The ten-subrequest ceiling in `wrangler.jsonc` is approved for this Worker
on Workers Paid against a budget of 1,000 subrequests per invocation. A
fresh tick without a pending attempt reads the manifest and reservation.
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

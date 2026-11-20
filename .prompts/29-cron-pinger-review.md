# Review: cron pinger (task 29, `dc3fe0e`)

Review the committed Worker at `worker-cron/` and the README section at `README.md` ("External feed refresh trigger"). Do not edit files. Verdict plus numbered defects.

## Why it exists

GitHub's scheduler has never fired a `schedule` event for this repo — zero events, including for a throwaway `*/5` probe. Manual dispatch works. The pinger is now the only trigger keeping the feed fresh, so a bug here is silence, and silence is the failure mode that matters.

## Intended behaviour

Every five minutes: read `current.json` from R2; dispatch `feed-refresh.yml` when `listsVerifiedAt` is missing or older than 12 minutes; skip when a run is already queued or running; log one structured record per tick; never throw out of the handler. Three subrequests on a dispatch tick, one otherwise.

## Check

1. **The decision is right at the edges**: missing manifest, missing `listsVerifiedAt`, exactly 12 minutes, a malformed value, and clock skew. Nothing throws out of `scheduled` and loses the tick.
2. **The skip holds.** A queued, in-progress, pending, requested or waiting run must prevent a dispatch; a completed one must not.
3. **A duplicate dispatch is harmless.** Confirm the workflow's `concurrency` group makes a race queue rather than publish concurrently, and that the pinger cannot dispatch in a loop if GitHub reports the new run late.
4. **Runtime compatibility.** This runs in workerd, not Node. Two divergences already bit us live (`URL.parse`, `redirect: 'error'`). Look for anything else Node accepts and workerd does not, and say whether the tests would have caught each divergence.
5. **Credential handling.** Bucket-scoped R2 credential validated against the endpoint and account; the GitHub token is fine-grained with Actions write on one repo. Nothing secret in logs, nothing secret in the repo.
6. **Subrequest and CPU budget** stay inside Workers limits at `*/5`, and the declared `limits.subrequests` is honest.
7. **Failure is loud but not fatal**: an R2 or GitHub failure logs its stage and message, does not dispatch blindly, and the next tick retries.
8. **Docs match the code** — secret names, cadence, how to pause, and the fact that the GitHub schedule stays enabled.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

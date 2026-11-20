# Cron pinger

The scheduled Worker runs every five minutes and requests a feed refresh on
`main` when `current.json` has no `listsVerifiedAt` or the timestamp is more
than twelve minutes old. GitHub's workflow schedule remains enabled.

Each dispatch first claims a conditional reservation in R2. A manifest
timestamp later than the reservation's attempt time clears it, even when
the manifest is stale again. While a reservation is unresolved, the Worker
checks recent GitHub dispatch runs on each tick. A visible active run keeps
the reservation in place. After ten minutes, a complete lookup showing only
terminal runs or no matching run clears the reservation. Failed or
incomplete lookups retain it and the next tick retries reconciliation.
After a release, the next stale tick checks every active workflow status
before attempting a new dispatch.

The ten-subrequest ceiling in `wrangler.jsonc` is approved for this Worker
on Workers Paid against a budget of 1,000 subrequests per invocation. A
fresh tick reads the manifest and reservation. A reconciliation tick uses
at most four subrequests. A dispatch tick uses nine, with a tenth for the
conditional release if GitHub explicitly rejects the dispatch.

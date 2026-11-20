# kwip

A live sports event directory: a schedule grouped by category, each event pointing at the sources that carry it. A source is either an outbound `link` or an `iframe` embed; this repo hosts no media.

Stack: Nuxt 3 (SSR on), Tailwind v4, deployed to Cloudflare Workers.

Build target is the committed fixture feed in `public/fixtures/`. A live provider feed is an adapter, selected with `NUXT_PUBLIC_FEED_BASE` (and `NUXT_PUBLIC_FEED_MIRROR_BASE` for the fallback).

Read `SPEC.md`, `DECISIONS.md` and `API.md` before changing anything. Facts about the outside world live in `API.md` — take them as given and don't re-derive them.

- `SPEC.md` — what exists, page by page
- `DECISIONS.md` — settled choices, numbered, do not relitigate
- `API.md` — the external JSON feed we consume
- `CONTRACT.md` — which files each agent owns
- `INFRA.md` — hosting, domains, deploy
- `DESIGN.md` — OSS-sourced design pass and its priority order
- `.prompts/` — the brief for the current task

## Checks

```sh
pnpm test   # node:test, no extra dependency
pnpm build
```

## Deploy

Cloudflare Workers (see `INFRA.md`). Both zones (`kwip.fyi`, `kwip.lol`) must be **Active** in Cloudflare before the first deploy, or the custom-domain routes fail.

```sh
pnpm build             # Nitro cloudflare_module → .output/
pnpm wrangler login    # once per machine
pnpm deploy            # wrangler deploy; pass flags after --, e.g. pnpm deploy -- --dry-run
pnpm preview           # local wrangler dev against .output/
```

Rollback: `pnpm wrangler rollback <version-id>`.

## Feed snapshots

Install the isolated publisher dependency once per runner checkout. Use a credential file scoped to the preview bucket and set `NUXT_PUBLIC_FEED_BASE` to the feed URL.

```sh
pnpm --dir scripts --ignore-workspace install --frozen-lockfile
pnpm publish:feed --credentials-file .r2-preview-credentials.json --dry-run
pnpm publish:feed --credentials-file .r2-preview-credentials.json
```

## Refreshing the feed

The **Feed refresh** workflow runs every 15 minutes on GitHub's default
branch and publishes to `kwip-feed-prod`. Configure the repository Actions
secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
`R2_ENDPOINT` using credentials scoped to that bucket. Configure the
`feed-production` environment to allow only the protected `main` branch
without requiring approval for scheduled runs.

To force a run, open **Actions → Feed refresh → Run workflow**, select
`main`, and click **Run workflow**. Check the run summary for the publisher
result. A `paused` result means the provider blocked the runner and a
person needs to investigate before resuming publication.

The workflow opens or updates one live GitHub issue labeled `feed-refresh`
when publication fails or pauses, or when the pre-publication manifest is
missing or its last list verification is more than 45 minutes old. Recovery
requires a fresh precheck and an outcome of `published` or `unchanged`.
A separate completion-triggered workflow reports cancelled live runs on
`main`, including pending runs GitHub replaces before they start. It reads the
Actions recovery artifacts under the issue update lock. The
artifact holds the latest confirmed live attempt by start time, including
reruns of older runs, and expires after seven days. Live recovery uploads it
before closing any incident and retires the previous artifact. It alternates between two fixed
artifact names so a rerun can upload before retiring its predecessor. If
retirement fails after the upload, incident closure proceeds and the next
healthy refresh retries the cleanup. The
check reads at most one artifact in each slot and fetches the exact cancelled
attempt only if the event omits its start time. Healthy runs leave no issue activity. If the lookup
fails after retries, the cancellation still alerts and the issue marks
the lookup as inconclusive.

To exercise the issue lifecycle without publishing, dispatch `failed`, `paused`
and `stale` in order using the `simulate` input. Then dispatch `simulate=none`
with `simulate_recovery` enabled. The rehearsal uses its own marked issue
with the `feed-refresh` label. Only explicit simulated recovery closes it.
Live runs and rehearsals can each have one open issue.

GitHub disables scheduled workflows in public repositories after 60 days
without repository activity. A commit that changes the workflow's cron schedule
re-enables it. A disabled or unscheduled workflow cannot check the manifest age
or raise an alert about its own absence. The GitHub issue is the only alert channel.

### Verify the refresh workflows

Run the following from the repository root with Git, Go, Node.js, jq, ShellCheck,
and act v0.2.98 installed. The pinned actionlint revision validates GitHub's
`concurrency.queue` setting, which keeps pending issue updates in order.

```sh
kwip_lint_dir=$(mktemp -d)
git init -q "$kwip_lint_dir"
git -C "$kwip_lint_dir" fetch --depth=1 https://github.com/rhysd/actionlint.git 644076a59742c2d1540ebd4686eab3c308f0e562
git -C "$kwip_lint_dir" checkout --detach FETCH_HEAD
(cd "$kwip_lint_dir" && go build -o actionlint ./cmd/actionlint)
kwip_workflow_test_dir=$(mktemp -d)
npm install --prefix "$kwip_workflow_test_dir" --no-save --ignore-scripts yaml@2.9.1
"$kwip_lint_dir/actionlint" &&
  KWIP_WORKFLOW_TEST_DIR="$kwip_workflow_test_dir" node --test scripts/feed-refresh-workflow.test.mjs &&
  pnpm build &&
  pnpm test &&
  pnpm exec wrangler deploy --dry-run &&
  pnpm --dir worker-cron --ignore-workspace install --frozen-lockfile &&
  pnpm --dir worker-cron check
```

## External feed refresh trigger

`kwip-feed-cron` is a scheduled-only Cloudflare Worker. It runs every five
minutes in UTC and reads `current.json` from `kwip-feed-prod`. A missing
`listsVerifiedAt` or one more than 12 minutes old makes a dispatch eligible.
The Worker accepts up to one minute of future clock skew. Malformed or
further-future timestamps are logged as manifest errors.

The Worker checks the queued, in-progress, pending, requested, and waiting
statuses on `main` with one result per filter. An active run or inconclusive
lookup skips dispatch. Before POSTing, the Worker conditionally reserves a
ten-minute cooldown in `cron-dispatch-cooldown.json` in R2. This covers delayed
GitHub run visibility and competing cron ticks. Only one tick can successfully
dispatch per ten-minute cooldown. An explicit rejection releases the
reservation so a later tick can retry. An ambiguous timeout or server error
leaves it in place until expiry. If the cooldown record is corrupt, the
Worker first confirms GitHub is idle, then repairs it with a conditional
write. The GitHub schedule stays enabled and both triggers still use the
workflow's existing concurrency group.

The pinger runs 288 ticks per day on Workers Paid, with a deployment budget
of 1,000 subrequests per invocation. The original three-subrequest figure
was an estimate. The Worker now enforces a ceiling of ten per tick. A fresh
tick uses one R2 read. A stale tick can use two R2 reads and five small
GitHub lookups. An idle tick adds a conditional R2 write and the dispatch
POST, and an explicit rejection can add one release write.

Provision `GITHUB_REFRESH_TOKEN` as a fine-grained GitHub token for
`lwtgg/kwip` with **Actions: Read and write**. Install it directly with
Wrangler. `R2_CREDENTIALS` is the production entry from the publisher's
`.r2-credentials.json` shape. Use a `kwip-feed-prod`-scoped R2 Object Read &
Write credential for the cooldown object. From the repository root:

```sh
pnpm --dir worker-cron --ignore-workspace install --frozen-lockfile
pnpm --dir worker-cron check
pnpm exec wrangler secret put GITHUB_REFRESH_TOKEN --config worker-cron/wrangler.jsonc
jq -ce 'if has("bucket") then . else .["kwip-feed-prod"] end | select(.bucket == "kwip-feed-prod")' .r2-credentials.json |
  pnpm exec wrangler secret put R2_CREDENTIALS --config worker-cron/wrangler.jsonc
pnpm exec wrangler deploy --config worker-cron/wrangler.jsonc
pnpm exec wrangler tail --config worker-cron/wrangler.jsonc
```

In tail, look for a `feed_refresh_tick` record with the manifest age, the
decision, and the dispatch result. Errors include the stage, a fixed reason
code such as `invalid-manifest-json` or `request-timeout`, and the HTTP status
when available. To accept the deployment, observe a real
cron tick and confirm a dispatched refresh advances `listsVerifiedAt` in R2.
To pause the pinger, set `triggers.crons` to `[]` in
`worker-cron/wrangler.jsonc` and deploy that Worker configuration.

# Task 27 — the refresh workflow

Everything is in place: the publisher writes a validated generation to R2 under a precondition, the reader serves the newest one, and the edge cache keys on the generation so a publish is picked up immediately. Wire the schedule.

Read `.agents/skills/workers-best-practices/SKILL.md`, `docs/freshness-design.md` section "Scheduling", and the publisher at `scripts/collect-publish-feed.mjs` first.

## File

New `.github/workflows/feed-refresh.yml`. Nothing else changes.

- `on.schedule` at `*/15 * * * *`, plus `workflow_dispatch` so a run can be forced.
- `concurrency` group `feed-refresh` with `cancel-in-progress: false` — a publish must not be killed by the next tick.
- `permissions: contents: read`.
- `timeout-minutes: 10`, and a step timeout below it so a hang fails the run rather than the runner.
- `runs-on: ubuntu-latest`; pin each action to a full commit SHA with the version in a comment.
- One job. `node-version` matching the repo's engine if one is declared, otherwise 22.
- `pnpm --dir scripts --ignore-workspace install --frozen-lockfile` for the signer, then `pnpm publish:feed --bucket kwip-feed-prod`, with `NUXT_PUBLIC_FEED_BASE` set to the production provider base.
- Credentials from repository secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`. Never echo them. Do not use a credential file in CI.
- The publisher's single JSON result line goes to `$GITHUB_STEP_SUMMARY` (fenced or as a small table), and to the log.
- The job fails when the publisher exits non-zero, unchanged: `failed` and `paused` are failures, `published`, `unchanged`, `backoff` and `conflict` are not.
- No caching of the signer install: it is one small package and a stale cache is worse than three seconds.

## Also

- Add a short "Refreshing the feed" section to `README.md`: the cadence, the four secrets, how to force a run, and that a `paused` result means the provider blocked the runner and needs a person.
- `.gitignore` already covers the credential files; confirm nothing CI-only is ignored.
- There is no git remote configured yet and the repo must be public before Actions minutes are free. Say what remains to be done to actually activate the schedule rather than assuming it runs.

## Rules

- No source change outside `.github/workflows/`, `README.md` and `.gitignore` if needed.
- Never interpolate a secret into a `run:` block via `${{ }}` string substitution; use `env:`.
- No `pull_request` trigger — this publishes to production storage.

Stop condition: the workflow parses (`actionlint` if available, otherwise state that it is unavailable and what you checked by hand), `pnpm build`, `pnpm test` and `wrangler deploy --dry-run` still pass, and you have run the exact `publish:feed` command once locally against the **preview** bucket to confirm the CLI surface the workflow uses. Report the cron, the secret names, what still has to happen before the schedule is live, and whether the first real run should be forced by hand.

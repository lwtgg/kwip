# Task 28 — alert when a refresh fails, pauses or stops happening

The refresh runs every 15 minutes and nothing watches it. A `failed` or `paused` result is a red run in a tab nobody opens, and the site ages silently until the stale bar. Close that.

Alerts are a single GitHub issue, created once and kept current. No new service, no dependency, no webhook.

Read `.github/workflows/feed-refresh.yml` and `docs/freshness-design.md` "Failure states" first.

## Trigger

Two independent conditions, both in `.github/workflows/feed-refresh.yml`:

1. **The publish exits non-zero.** `failed` and `paused` alert; `published`, `unchanged`, `backoff` and `conflict` do not. A `paused` alert must say plainly that the provider blocked the runner and a person has to look.
2. **The feed has stopped advancing.** Before publishing, read `current.json` (HEAD enough) and compare `listsVerifiedAt` with now. Over **45 minutes** — three missed ticks — is an alert, computed from the manifest, never from the run's own timing. Read R2 through the existing `scripts/` signer, reusing the publisher's credential resolution rather than a second copy of it.

## The issue

- Label `feed-refresh`, title `Feed refresh is failing` / `Feed has stopped advancing` — fixed titles, so search by label plus state finds the existing one.
- Open issue found → update its body with the newest detail and add a comment rather than opening a second. None → create.
- Assign nobody, do not close by hand.
- Body: the outcome, `commitId` when there is one, provider status and `Retry-After` when present, the run URL, the `listsVerifiedAt` age for the stale case, and a one-line "what to do". Never a secret.
- **Success closes it.** Any run that ends `published` or `unchanged` with no stale finding closes the open `feed-refresh` issue with a comment naming the recovering commit. A closed issue must not be reopened by the next success.
- Permissions: `issues: write` in addition to `contents: read`.

## Simulation

Add a `workflow_dispatch` input `simulate` with `none` (default), `failed`, `paused` and `stale`. A simulated run exercises only the alert path and skip the publish, so both alert shapes and the auto-close can be proven without waiting for a real outage. Simulated text must be marked as simulated in the body so it is never mistaken for a live incident.

Steps that alert run on `if: failure()` style conditions, not by parsing exit codes by hand.

## Known limits to write down

- GitHub disables `schedule` triggers after 60 days without repository activity. Say so in the README section, and that a commit re-enables it.
- If the workflow is disabled, nothing runs, so nothing alerts. The 45-minute check cannot cover its own absence.
- The issue is the only channel. If you judge that insufficient, say so rather than inventing a second integration this task.

## Rules

- `.github/workflows/`, `scripts/` if a shared helper is genuinely reused, `README.md`. Nothing else.
- No secret in any `run:` block by `${{ }}` substitution; use `env:`.
- Reuse the publisher's credential resolution — do not fork it.

Stop condition: the workflow parses (actionlint if available), `pnpm build`, `pnpm test` and `wrangler deploy --dry-run` pass, and the simulated `failed`, `paused` and `stale` runs have each produced or updated the one issue, with a good run after them closing it. Report the issue number, the four simulated outcomes in order, and the label state after the close.

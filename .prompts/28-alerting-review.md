# Review: task 28 refresh alerting

Review the uncommitted diff against `.prompts/28-refresh-alerting.md`. Do not edit files. Verdict plus numbered defects.

Load `.agents/skills/requesting-code-review/SKILL.md` first.

Builder reports all four simulations exercised: `failed`, `paused` and `stale` each produced one issue, a recovery run closed it, and the label survives closure. actionlint, build, 72 tests and the dry run passed.

## Check in this order

1. **Alert conditions.** Alerts fire on `failed` and `paused` only. `published`, `unchanged`, `backoff` and `conflict` must not alert. The stale condition must come from the manifest's `listsVerifiedAt` and nothing else.
2. **One issue, not many.** The open issue is found by label and state, updated rather than duplicated. Prove a second failing run comments instead of opening a second issue, and that a `stale` alert and a `failed` alert can never open two.
3. **Recovery closes.** A good run closes the open issue once, with a comment naming the commit, and never reopens it afterwards. A closed issue must not be matched by the next success and closed twice.
4. **Simulation isolation.** Simulated text is marked as such, a simulated run cannot touch the publisher or R2 state, and a simulation must not update a live incident issue and then be mistaken for it. Check what happens if a real incident is already open.
5. **The freshness check.** `--check-freshness` must not collect, must not write state, must exit 0 on `fresh`, `stale` and `missing`, and must not fail the job in a way that hides the publish step. Check what `missing` does to the alert — an absent manifest for a bucket that once had one is an incident, and `missing` may currently be silent. Also check the 45-minute boundary exactly.
6. **Failure propagation.** The alert job must run after a failed or cancelled refresh and must still get the failure detail. Check a failure inside the freshness step, a failure in install, and a run cancelled by the next tick.
7. **What the issue says.** Outcome, commit when present, provider status, `Retry-After` only in the two wire formats, run URL, age for the stale case, and a concrete action. No secret. `paused` must say a person has to look.
8. **Permissions and injection.** `issues: write` only where needed, `pull_request` still absent, no `${{ }}` secret in a `run:` block, and no untrusted value interpolated unquoted into shell.
9. **Limits.** The README notes schedule auto-disable after 60 days of inactivity and that alerts share the workflow's fate if it is disabled.
10. **Script surface.** `--check-freshness` is a top-level flag on a command named `publish`, which is odd; judge whether it belongs, and whether it can be combined with `--dry-run` or `--provider-status` in a way that silently does the wrong thing.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

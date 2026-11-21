# Review: publish supplement sources (task 41)

Review branch `task/41-publish-supplements` against `.prompts/41-publish-supplements.md`. Do not edit
files. Verdict plus numbered defects. Read `verification-before-completion` and `workers-best-practices`.

## Check

1. **Matching did not drift.** The rules moved, they did not change: 3 h window, sorted tokens, category
   only as a tiebreak, exactly one candidate, same host allowlist. The app and publisher import one module
   with no copy left behind.
2. **Provider failure is inert.** One GET per run, bounded, no retry; failure, timeout or a bad body skips
   the merge and cannot fail the publish. Judge the stub diff: only supplement entries may differ, every
   other key and order unchanged.
3. **Merge discipline.** Supplement sources are appended, never reorder or drop a primary, no duplicate
   `sourceKey` against the detail's own sources or each other, quality mapped to a band, `live` only from
   a successful status call. Check a conflict case: a supplement URL already present as a primary.
4. **Probe coverage stays bounded.** Supplement sources join `candidates()` under the same window and 24/7
   rules and the same 40-source cap; no status call outside the window; one dead supplement cannot starve
   primaries out of the probe.
5. **CLI/edge, not nuxt-only code.** The publisher is plain Node: check imports, `.ts` resolution, and that
   the fixture base still runs locally with no network.
6. **Browser fallback.** The client fetch is skipped only when that generation's detail already lists a
   supplement for the event; otherwise today's path, session cache included, is unchanged; no double
   listing when both produce a URL. Confirm a stale cached supplement from sessionStorage cannot duplicate
   a generation-supplied one.
7. **No scope creep.** No dependency, no proxy, no `<video>`, no cache-key or TTL change, no ad change.
8. Tests cover matching, the conflict/dedupe case, and the absent-provider path.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

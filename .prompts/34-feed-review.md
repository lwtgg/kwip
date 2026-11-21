# Review: feed deadlines (task 34)

Review the branch `task/34-feed-deadlines` against `.prompts/34-feed-deadlines.md` and `DECISIONS.md` rule 8. Do not edit files. Verdict plus numbered defects.

## Check

1. **A render always finishes.** Stall the upstream and the snapshot, and the page still renders from the bundled seed. Prove it with a stalled server, not by reading the code.
2. **Every hop is bounded**, including the cache-identity read and the whole chain, not just the first fetch. No `await` in the request path is unbounded.
3. **Failover order is intact**: a timeout is treated as a failure and advances the chain; a fast rejection behaves exactly as it does on `main`.
4. **Healthy path is unchanged**: same payload, `fromCache` semantics, status, headers and cache key. Diff the response against `main` on a healthy local server.
5. **One log line per timeout**, naming the stage and elapsed time, and not one per retry within a hop.
6. **Deadlines are defined once** with a reason, and their sum still fits under the edge's own limit.
7. **Tests use fake timers**, are not flaky, and cover the seed fallback; the browser and unit suites pass.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

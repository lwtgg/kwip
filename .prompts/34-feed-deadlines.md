# Task 34: never hang a render on a feed

Uncached renders occasionally end in a 504. Between 38 of them in six hours, every one is `cacheStatus: miss`, and they land on `/` and `/live/...` — a cold visitor gets a Cloudflare gateway timeout where a cached visitor gets 200 in under 400 ms. Nothing in the read chain has a deadline: the upstream `$fetch` in `fetchFromBase` runs with `retry: 0` and no signal, and `getFeedCacheIdentity` awaits an R2 open in the critical path. When the provider or R2 stalls, the request stalls until the edge gives up.

The rule this task enforces: a render always finishes, and the worst case is the bundled seed rather than a timeout.

Read `server/utils/feed.ts`, `server/utils/snapshot.ts`, `server/utils/edge-cache-handler.ts`, and `DECISIONS.md` rule 8 (freshness) before starting. Do not change what is served when everything is healthy.

## Requirements

1. **Bound every upstream attempt.** `fetchFromBase` gets a deadline. Distinguish a timeout from a network failure so the existing failover order still applies: primary, then mirror, then snapshot, then the bundled seed. A timeout is a failure, not a different path.

2. **Bound the identity read.** `getFeedCacheIdentity` must resolve within its own short deadline and fall back rather than block. A cache-identity timeout may not prevent the page from rendering.

3. **Keep the fallbacks reachable.** After a timed-out primary and mirror, the snapshot and seed paths must still get their own budget; the whole chain, not just one hop, is bounded.

4. **Say so.** A timeout logs one structured line with the endpoint kind, the stage and the elapsed time, so the next occurrence is visible in `wrangler tail` instead of inferred from the edge analytics. No new dependency, no binding.

5. **Deadlines are named, not magic numbers**: define them in one place next to the fetch, with the reasoning in a comment (the edge gives up long before these fire in sequence).

6. **Behaviour when healthy is unchanged**: same payload, same `fromCache` provenance, same cache key, same status codes, same headers.

## Tests

- Unit, in the existing suites' style: a fetcher that never resolves produces a timeout, the chain reaches the snapshot, and the log line is emitted once. A fetcher that rejects fast still follows today's order. A snapshot that hangs falls through to the seed. Use fake timers so the suite stays fast.
- Confirm `/`, `/live/<uri>`, `/vods` and `/sitemap.xml` still render with an aborted upstream.
- Browser: force the provider to hang in the harness and assert the page renders (with the stale/seed marker if the code sets one) within a bounded time instead of erroring.

## Gates

`pnpm test`, `pnpm build`, `wrangler deploy --dry-run`, and all three Playwright suites. Then a local proof: with the built Worker, a request whose upstream is stalled returns 200 rather than hanging, and the log line names the stage.

Do not deploy. Leave the ads flag off.

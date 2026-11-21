# Task 38: find out why one client's page requests 504

Since the edge cache shipped (`c749920`, 2026-11-19 14:05 PST / 22:05Z) `kwip.fyi` has been
returning 504s to one external client, and only to it. 1,144 in the last 24 hours — about 2% of all
traffic, with bursts of 30 per minute — while every other client, including ours, gets 200s.

Nobody has seen the requests, the client, or its headers. This task makes the failure visible instead
of guessing at it, and adds a hard ceiling so a request that stalls cannot sit until the edge times it
out.

Read `server/utils/edge-cache-handler.ts`, `server/utils/edge-cache.ts`,
`server/utils/feed.ts` (`withinFeedDeadline`, `FEED_DEADLINES_MS`), `server/middleware/`, and
`INFRA.md`. Read `verification-before-completion` and `web-perf` first.

## What is known, all of it measured

- **Onset** 2026-11-19T22:00Z. Before that hour: zero. The edge-cache and R2-reader deploys landed at
  22:05Z and 22:12Z; the alerting deploy before them. 10 in the first hour, then 17, 17, 47, 20, 70,
  58.
- **Only cacheable paths.** All 1,144 are `/`, `/vods`, `/live/...` or `/sitemap.xml`, across 228
  distinct paths. Zero on `/about`, `/mirrors`, `/go/*`, `/banners/*`, `/api/*`.
- **`cacheStatus: miss`, `originResponseStatus: 0` on every one.** Nothing came back from the Worker.
  Edge response is 504, about 100 s after the request.
- **The client sends `PUT` then `GET` on the same URL**, empty user agent, no query string, about one
  URL a minute normally and 30 a minute during bursts. Its PUTs get **204 from the edge** (never from
  the Worker: `cacheStatus: none`, origin 0). Our own PUTs reach the Worker and return 200. So when
  its PUT is answered at the edge, the following GET 504s; in 24 h, 1,103 PUTs took the 204 path and
  1,135 GETs 504ed.
- **Not reproducible from here.** 240 concurrent GETs with fresh query strings, 120 PUT+GET pairs,
  60 pairs on plain URLs with an empty UA, 25 concurrent `/vods` requests, IPv6, HEAD, and steady
  1-per-4s polling all returned 200. `wrangler tail --status error` has never shown one of them.
- A plain `GET https://kwip.fyi/vods` from our machine takes ~0.2 s and the Worker reports
  `wallTime` ~50 ms.

## Scope

1. **Instrument the ingress path, cheaply.** Log one JSON line at the start of every HTML page request
   (`event: 'page_start'`, with `ray`, `path`, `method`, `ua` truncated, and whether the edge-cache
   branch was taken) and one at each boundary already in `lookupEdgePage` (identity, cache-match,
   after-miss) plus at the end of `storeEdgePage`, all with `elapsedMs`. A request that starts and
   never logs again is the answer; a request that never logs at all tells us it never reached us.
   Keep it to `console.log`, no new dependency, and confirm Workers Logs/tail shows them.
2. **Add a total-render ceiling.** Wrapped around the whole HTML render (not per feed hop): if a page
   has not produced its response by 8 s, stop waiting and serve the best of, in order: whatever the
   edge cache had, the seed detail, or a short `503` HTML page with a retry line. It must never make a
   healthy request slower, and it must not disturb `snapshotUnavailable`, the 404s, or `storeEdgePage`
   (a cancelled render must not be cached).
3. **Identify the edge-side actor.** The PUT getting a 204 without the Worker is not the Worker's
   response for a PUT. Check, in this order, with the dashboard or an API token that has the cache
   scopes (the current wrangler token lacks them): Cache Reserve, Tiered Cache, Cache Rules
   (`/zones/<id>/rulesets`), Snippets, APO, and any Worker route other than the `kwip` custom domains.
   Report which are on and what answers a PUT.
4. **Reproduce with the real shape** in `scripts/`: PUT then GET, no query, empty UA, the same 30 URLs,
   once a minute for ten minutes, from this machine and — if a second network is reachable without new
   accounts — from there. Report the tail lines side by side with the response codes.

Do not change the cache key, the TTLs, `no-store`, or the ad flag. Do not deploy. No new dependency.

## Verification

- All three probes above, with the actual log lines and tail output quoted.
- A healthy page still: `x-kwip-cache: miss` then a hit on the second request, `pnpm test`,
  `pnpm build`, `wrangler deploy --dry-run`.
- The 8 s ceiling exercised on purpose: force a stall in a test and show the fallback response and
  that no cache entry was written for it.

Report what reached the Worker, what did not, which edge feature answers the PUT, and the ceiling
proof. If the answer is "no request ever reaches the Worker", say that plainly and list the two or
three zone settings most likely to be responsible.

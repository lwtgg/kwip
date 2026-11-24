# Task 56 — the page must read our generation, not the provider

Blocker for 53 and 55. Task 52 enriches the generation, and the generation does carry it: the current
published payload has `match` on 75 of 210 events, verified by reading the R2 object directly. **No page
shows a score.** The event page for `ucl/2026-11-24/bodo-las` renders without one.

Cause: `feedBase` points at `https://api.ppv.st/api`, so `isCrossOriginFeed(...)` is true and
`useFeedEndpoint` takes `browserRefresh` on the server as well as the client
(`app/composables/useFeed.ts:173-188`, branch at `:187`), which calls the provider and never touches the
generation. The generation is used only as a fallback after upstream failure, so everything we add to it —
scores now, anything later — is invisible while the provider is up.

Make the site read its own generation, first, on both sides:

1. **New same-origin feed route** `server/routes/api/feed/[...path].get.ts`, serving the snapshot reader that
   already exists in `server/utils/snapshot.ts`. It serves any valid snapshot path from the newest readable
   generation, with the generation in the cache key and the cache rules of decision 11. A path the readable
   generation lacks is `404` with the same shape the provider uses for it — rule 20, no back-fill. A missing,
   unreadable or stale-unhealthy generation proxies `api.ppv.st` with the existing timeouts, and `ping`
   always proxies.
2. **Point `feedBase` at it** (default `/api/feed` when `NUXT_PUBLIC_FEED_BASE` is unset). `isCrossOriginFeed`
   then stops firing, the generation-first branch at `feed.ts`/`useFeed.ts` is the live path, and the client
   stops calling the provider directly. Keep the fixtures path and the `NUXT_PUBLIC_FEED_BASE` override
   working, and keep `feedMirrorBase` semantics for an unreachable provider.
3. **Do not regress the fallback**: an unreadable generation must still reach the provider, then the mirror,
   then the seed, in that order, and the stale/refresh plumbing (`fromCache`, `snapshotOmitted`, the 60 s
   bucket) must still work with a same-origin base.
4. Verify the host token replacement and the ad click-under are unaffected, and that the route does not
   render HTML.

Tests: the route serves a ranged snapshot payload; `404`s a path absent from a readable generation and does
not proxy; proxies when the manifest is missing or unreadable; `ping` always proxies; a same-origin
`feedBase` makes `isCrossOriginFeed` false; and an SSR request for a matched event carries the score in the
HTML. Prove the last one end to end against the live generation.

Gate: full suite, both builds, default rebuild, dry-run, all six browser suites at both widths, and a
before/after on the actual production feed. Commit, do not deploy, do not touch `.prompts` or `DECISIONS.md`.

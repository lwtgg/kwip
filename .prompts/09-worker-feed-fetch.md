# Task 09 — fix production feed fetch (blocker)

The first real deploy is live and broken. `https://kwip.fyi/` renders the feed error state; the payload contains `error code: 522`. `GET https://kwip.fyi/fixtures/streams.json` returns 200 JSON when called from outside, so the asset itself is fine. The Worker's SSR fetch of its own origin times out.

Cause: `server/utils/feed.ts` absolutises `/fixtures/...` against the request origin, then fetches it over the network — a Worker calling its own custom domain. Use the **assets binding** instead of a network round-trip whenever the resolved URL is same-origin.

## Do

1. `wrangler.toml`: add `binding = "ASSETS"` to the existing `[assets]` table.
2. `server/utils/feed.ts`: `fetchFeed()` takes an optional same-origin asset fetcher. When the resolved URL's origin equals `requestUrl.origin` and an asset fetcher is available, resolve the payload from the binding (`assets.fetch(request)` then `.json()`), keeping the existing response validation, `{host}` substitution and mirror fallback exactly as they are. No asset fetcher, or a cross-origin URL, keeps the current network path — so dev and the live provider feed are unchanged.
3. `app/composables/useFeed.ts`: on the server, read the binding from the request event (`event.context.cloudflare?.env`, falling back to `globalThis.__env__`) and pass it through. Bindings are not serialisable, so resolve it inside the `useAsyncData` handler, never into payload state.
4. The sitemap and any other `event`-based caller must keep working with the same helper.

## Don't

- No `app/**` behaviour changes beyond the binding lookup in `useFeed.ts`. No styles, no copy.
- No new dependency.
- No deploy; report the build and the diff instead.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, and `pnpm exec wrangler deploy --dry-run` exits 0. Reply with the changed files, both outcomes, and one sentence on how a dev run still reaches the fixtures.

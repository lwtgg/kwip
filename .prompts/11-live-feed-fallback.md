# Task 11 — live feed survives a blocked server egress (blocker)

## Facts

- `NUXT_PUBLIC_FEED_BASE` is now `https://api.ppv.st/api` (set in `.env` and `[vars]`). The deployed site shows the feed error state because every server-side fetch returns `{"success":true...}`-shaped 200 with `success:false, error:"IP blocked. Please stop harassing our API."` — the provider blocks the Worker's egress, with and without a browser user agent.
- The provider's mirror `https://api.ppv.cx/api` no longer resolves.
- The **browser** can call the API fine (CORS is open; verified with a real fetch from the page origin).
- The build runs on a normal residential IP, where the API answers normally.

So: server rendering needs a seed, and the browser is the only live path.

## Do

1. **Build-time snapshot.** New `scripts/snapshot-feed.mjs`: when `NUXT_PUBLIC_FEED_BASE` is absolute, fetch `/streams`, `/vods`, then every `uri_name` at `/streams/<uri>` and every `slug` at `/vods/<slug>`, concurrency 4, and write each raw JSON response to `public/feed-cache/` using the same path layout (`streams.json`, `streams/<uri>.json`, `vods.json`, `vods/<slug>.json`), plus `meta.json` with `fetchedAt`. Skip the whole thing (exit 0) when the base is `/fixtures`, and leave an existing snapshot alone on a failed fetch rather than truncating it. Add `"snapshot": "node scripts/snapshot-feed.mjs"`, wire `deploy` to `pnpm snapshot && pnpm build && wrangler deploy`, and gitignore `public/feed-cache/`.
2. **Server fallback.** In `server/utils/feed.ts`, when the upstream fetch fails or returns `success !== true`, resolve `feed-cache/<same path>` against the request origin and read it through the same `ASSETS` branch that already serves same-origin URLs (do not add a second mechanism). Run the cached payload through the same validation and `{host}` substitution. Rethrow the original upstream error only when there is no binding and no cached file, so dev without a snapshot still behaves as today.
3. **Client refresh.** In `app/composables/useFeed.ts`, when the resolved endpoint is cross-origin and the initial payload came from an error or from the cache, refetch from the provider **in the browser** exactly once per key on mount; a manual `refresh()` always goes to the browser when cross-origin. Guard against loops, keep the skeleton up while the retry runs, and make sure a successful browser fetch replaces the cached payload and its timestamp.
4. **Provenance.** The server marks a cached payload (`fromCache: true` on the response object) so the page can prefer the browser retry; do not invent new feed fields, add it outside the response body types.

## Don't

- No change to route shapes, copy, or styles.
- No new dependency.
- Do not fetch the API from the browser on the fixture base.

Stop condition: `pnpm snapshot` populates `public/feed-cache/`, `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, and a local `wrangler dev` serves `/` with real events and posters after killing the upstream (prove the fallback). Reply with files, outcomes, and the count of snapshot files.

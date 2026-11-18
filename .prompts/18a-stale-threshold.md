# Task 18a — stop crying stale five minutes after a deploy

Every page carries an `isStale` computed that compares wall clock against the feed timestamp and trips at 300 seconds. The Worker cannot reach the provider, so the site is served from a snapshot that is only rebuilt on deploy — which means the "Directory data is older than 5 minutes" bar is on screen almost all the time, including on a healthy deploy. It reads as a permanent fault.

Five copies of the same rule, in `app/pages/index.vue`, `app/pages/vods/index.vue`, `app/pages/vods/[slug].vue`, `app/pages/live/[...uri].vue`, and `app/pages/c/[category].vue`.

## Behaviour

- New `app/composables/useFeedFreshness.ts`: `useFeedFreshness(origin, fetchedAt)` where `origin` is the feed's own `timestamp` and `fetchedAt` a `Ref<number | null>` set when data first arrived. Returns `isStale` (boolean computed) and the `retry` the pages already wire.
- Stale means **20 minutes** since the snapshot was captured (`origin`), or since it was received (`fetchedAt`) when there is no origin. It must not trip on `datav?.fromCache` alone any more — a cache that is two minutes old is not stale.
- `fromCache` still counts as a reason to refresh on the client; it is just not a reason to shout.
- Replace all five copies with the composable. Keep each page's existing `StateBlock variant="stale"` markup and its `@retry` wiring exactly as it is, and keep each page's existing message text.
- The bar must not appear while `nowSeconds` is still at its initial SSR value (the clock is set on mount); no flash on first paint.

## Rules

- No new dependency, no new route, no copy changes, no visual change.
- Do not touch `app/utils/**`, `app/components/**`, the player, the shield, `server/**`, or the logo.
- Those five pages only, plus the one new composable.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, a freshly rebuilt snapshot shows no bar, a page whose origin is 25 minutes old shows the bar, and `Refresh` still clears it. Reply with files, outcomes, and what you checked.

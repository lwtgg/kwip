# Task 60d — the score the page shows is frozen, and the detail page has none

The owner says "a lot of the scores are wrong". An investigation on production proved the digits are not
mapped wrong: on `/` at 1280 and 390, all 201 banners / 76 score nodes matched the SSR payload exactly, 0
side swaps, 0 clipped digits, before and after hydration. The numbers are **stale**, and one finished match
is still served as live.

Evidence to work from:

- `/live/cbb/2026-11-26/gtwn-tex` renders 5–10 `H1 15:53`; ESPN has 13–15.
- `/live/uecl/2026-11-26/hom-mon` renders 2–2 **Live** `90'+4'`; ESPN has 3–2 and `post` Full Time.
- The generation timestamp stayed at 19:41:20 for 9+ minutes and edge `age` climbed, while `/api/feed/streams`
  is `no-store` — so the staleness is the listing cache, not the feed endpoint.
- `/live/nfl/2026-11-26/chi-det` is a correct control.

Read `DECISIONS.md` rules 29 and 30 (just added) and follow them. Three parts.

## 1. Live pages must not be cached for 15 minutes

`server/utils/feed.ts`: `listingBoundary` (:358-370) and the `cacheBoundary` in `getFeedGeneration` (:484-487)
derive the boundary from `starts_at`/`ends_at` only. If any selected stream has `match.state === 'in'`, the
boundary is `min(eventBoundary, now + 60)`. `server/utils/edge-cache.ts:29` already clamps to 900 s, so this
marks the cache stale after a minute. Do not touch non-live behaviour: an upcoming or final slate keeps the
event-clock boundary.

Match on `state === 'in'` (the payload's field), not on the clock, and make sure a category, filter and detail
page all go through the same boundary path. Add unit tests for: live clamps to 60 s, upcoming and post do not,
the clamp wins against a far-off event clock, and a mixed slate takes the live clamp.

## 2. An open tab refetches on the same beat

`app/composables/useFeed.ts:175-176` only enables `browserRefresh` when the feed base is cross-origin; production
uses same-origin `/api/feed`, so a hydrated page never refetches. Allow the same-origin case, on a 60 s beat,
only while the feed contains a live match; stop the timer when nothing is live. Keep whatever dedupe or
abort behaviour the composable already has, and do not refetch while the tab is hidden.

`app/composables/useFeedFreshness.ts:4` hides the audience and replaces the page at 20 minutes; move that to
**ten** minutes, because a live score older than two publish cadences now means the publish has stopped, and ten
is still under the twelve-minute watchdog. Two minutes was tried first and replaces the page on most visits — the
publish only runs every five. Add unit tests on the boundary: 599 s is fresh, 600 s is stale, and a successful
retry acknowledges. Then fix the card suite so its own fixtures do not age out mid-run (shift the fixture clock
the way the supplemental runs already did) rather than loosening the bound.

## 3. The detail page renders the item's own match; the title order matches the banner

`app/pages/live/[...uri].vue`: the item's own `match` is in the payload and unused (verified: the item's
`data.match` carries the scores), while `:759-765` builds the pill from the event window and `:1034` only renders
`MatchBanner` for related events. Render the item's own banner in the hero when it has a match, using the same
props the listing passes, and let `StatusPill` prefer `match.state === 'post'` over `endsAt` so a finished match
cannot read "Live". Keep the no-match hero exactly as it is.

Then make the title and `<h1>` use the same away-first order `MatchBanner` uses (`:195` iterates away, home), so
`oly-mil` reads AC Milan vs. Olympiacos with 4–2, not the reverse. Check the canonical slug, `og:` tags, JSON-LD
and breadcrumbs still agree with the new title, and that no existing title test breaks silently.

## Gate

`pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, `pnpm exec wrangler deploy
--dry-run`, `tests/cards_browser.py .output --screenshots <dir>` and `tests/top_event_browser.py` (add the width
matrix if your change can move a card), all at 320/390/1024/1280/1440/1920/2560 where the suite covers them.
Never run `wrangler dev` while a build writes `.output/`. Report what you actually ran and the numbers. Commit,
do not deploy.

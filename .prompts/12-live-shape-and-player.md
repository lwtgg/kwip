# Task 12 — make the live feed actually work

The provider feed is now the source and it is **not the shape the fixtures were built from**. Three hard failures plus four smaller ones, all found on the deployed site.

## A. Detail responses are shaped differently (crash)

`public/feed-cache/streams/nba/2026-11-17/det-sa.json` (already on disk) has no `category_name`, no `starts_at`/`ends_at`, no `uri_name`, no `colors`, no `blurhash`, and its numbers differ in type. It has `category` (an **id**), `start_timestamp`/`end_timestamp`, `uri`, `viewers` as a number, and `substreams[]` that are objects carrying their own `sources`, not the flat fixture shape.

Normalise in the feed layer, not in the pages:

- Accept `start_timestamp`/`end_timestamp` as `starts_at`/`ends_at`, `uri` as `uri_name`, and coerce `viewers` to the string the components expect.
- Fill `category_name` from the matching entry in the list (`/streams`) by `uri_name`.
- Flatten `substreams[].sources` into the playback chain after the detail's own `sources`, labelled with the substream's `name`/`source_tag`.
- Tolerate absent `colors`/`blurhash` (empty array is fine; the components already have a fallback path — make sure none of them index blindly).

`app/pages/live/[...uri].vue` currently throws `Cannot read properties of undefined (reading 'trim')` three times per render because of this. After the change there must be zero console errors on a live event page.

## B. The player false-times-out (blocker)

The iframe is server-rendered, so its `load` often fires before hydration attaches the listener; the 12s timer then runs out and the page throws away a perfectly good player. Fix in `PlayerFrame.vue`: after mount, first ask whether the frame has already completed (readable `contentWindow`, complete document, or a completed `performance` entry for that URL) and treat that as loaded; keep the timeout as the fallback and re-check once more before declaring failure. Never advance while the frame holds a document.

## C. Unknown keys are not a 404

`/live/basketball/does-not-exist` and `/vods/nope` return 200 with the default entry's content. When the detail request itself fails (provider `success: false`, no snapshot), render the 404 page (`createError({ statusCode: 404 })` or the equivalent for the page) rather than substituting another event.

## D. `?filter=` on the homepage is ignored

`/?filter=live` and `/?filter=upcoming` render the same page. Honour the query on `/` exactly as the category page already does, and keep the filter links in sync with it.

## E. `?source=` is ignored

`/live/…?source=0` opens the default embed; `?source=999` is unvalidated. Read it on mount, use it when it is a valid index, fall back to the default otherwise, and push the index back to the URL when the user switches.

## F. Archive "View all" points at the live directory

On `/vods`, category headings and their `View all (n)` link go to `/c/<slug>`. Make them go to `/vods?filter=<slug>` and honour that query on the archive, or drop the link if the archive cannot filter — your call, but they must not leave the archive.

## G. Mobile tap targets

Category links and Refresh are 24 px tall, filters 28 px, the source select 33 px. Bring the interactive height to at least 44 px at `sm` and below without making the desktop header heavier.

## H. A failed browser refresh must not wipe a good page

Right now a failed client refresh surfaces `IP blocked. Please stop harassing our API.` and the page loses the snapshot it already had. Keep the data, show the existing stale banner, and only show the full error state when there is nothing to render.

## Rules

- Fixtures must keep working: point `.env` back at `/fixtures` at the end and confirm `/` still renders.
- No new dependency, no copy or route changes, no styles outside G.
- Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, zero console errors on a live event page, and `/live/basketball/does-not-exist` is a 404. Reply with files, outcomes, and what you checked.

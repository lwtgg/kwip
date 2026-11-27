# 60d fix round 2 — the review's finding 1, and the cheap nits

Review verdict on `be63348` is **changes requested** for one defect; 2–10 are notes. The full review is
`/tmp/60d-review-opus.log`. Rules 29 and 30 are amended in `DECISIONS.md` — read them first, the rule text has
moved under you.

## 1. Defect: a detail page opened before kickoff never shows its own score

`app/composables/useFeed.ts:315-318` polls the item only when `match.state === 'in'`, and `:425-442` takes
`detail.match` from the item payload alone. Load the page at `pre`, wait for the match to start, and the hero
stays "Upcoming · vs" with no score for the whole game while the pill beside it reads "Live" by the clock.
Reproduced: 130 s, `stream.json` 0 requests; the control that started at `in` fetched 3 times and read 1–0 12'.

Opening a detail page in the minutes before kickoff is the normal way onto it, so this cannot ship.

Fix: the item must keep polling whenever its event is about to be or is in play — `state === 'in'`, or
`state === 'pre'` with `now >= starts_at - <small margin>` (say 120 s) — and stop when `post`. Add a browser
test that loads at `pre`, flips the fixture to `in` with a score, and asserts the hero's own tiers show the
score after a tick without a reload. Include the reverse: an `in` page flipping to `post` must stop polling.

Finding 5 is part of the same defect and should be fixed with it: `StatusPill` maps `post` only, so it reads
"Ended" beside a Live banner in overtime and "Live" beside "Upcoming" in the pre-window. Map `match.state` as
rule 30 now says — `post` Final, `in` Live, `pre` Upcoming while the window is open — and cover the two
contradictions in a test.

## 2. Detail pages must clamp for the live scores in their related cards

`server/utils/feed.ts:497-502`: `/live/*` uses the item's window and its own `scoreBoundary`, and
`listingBoundary` returns `Infinity` for `/live` paths, but `[...uri].vue:1050` renders a related `StreamCard`
with a `MatchBanner` for every same-category event — nine live scores on one page. Take the minimum of the
item's boundary and any live match in the related set. Add the unit case.

## 3. The retry test uses a shape production never sends

`app/composables/useFeedFreshness.ts:42` returns without acknowledging when the payload has `fromCache`, and
production `/api/feed/streams` always sends `fromCache: true`. `tests/useFeedFreshness.test.ts:27-41` uses
`fromCache: false`, so it tests a path that cannot happen in the field. Keep it, and add the real one: a retry
answer with a newer `timestamp` and `fromCache: true` clears the notice.

## 4. Heading and seed-document order

`[...uri].vue:84-89` falls back to `matchingListItem.name` (feed order) while the item is loading or errored.
The list item carries `match`, so use the same away-first order. `server/handlers/page-renderer.ts:56-57`
writes `seed.data.name` into the timeout fallback `<title>`/`<h1>`, also feed order — give it the same
treatment. Keep "vs." for now; whether away-first soccer should read "at" is a separate question.

## 5. Two missing `readSnapshots` cases

An `always_live === 1` channel carrying an `in` match must clamp (24/7 rail and filter=live), and the same
channel under filter=upcoming must not.

## Gate

Full, to green, on a fresh default build: `pnpm test`, both presets, default rebuild, dry run, the whole card
suite including the pixel matrix, `tests/top_event_browser.py`. Report the polling evidence for item 1 (request
counts at `pre`→`in` and `in`→`post`), and note that WebKit stale gutter misses 6.44 vs 6.5 are known and not
yours. Commit when green; do not deploy. Keep `DECISIONS.md` edits out of your commit — the orchestrator has
uncommitted changes in it.

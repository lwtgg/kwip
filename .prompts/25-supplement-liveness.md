# Task 25 — make the supplement honest about liveness and quality

Task 22 shipped the strmfree supplement against fixtures. It has now been verified against a real in-progress event, and three things are wrong: the chip claims liveness the provider does not have, it carries no quality even though the quality is in the URL, and the user is told a dead stream is live.

Verified on `fla-wvu` (Florida Gators at West Virginia Mountaineers) at 20:23Z, 53 minutes after kick-off. The merge matched, deduped and rendered correctly — the failure is in what the chip asserts, not in how it is selected.

## What was observed

- Rendered third chip: `strmfree / strmfree.st / 2nd`, selected correctly on click, `iframe.src` set to the embed, no console errors, unique and ≥ 44 px at 390 px.
- The embed loads `200 text/html` and mounts a JW player shell, then parks on **"Stream starting soon"**. Zero `<video>`, zero playlist requests.
- `https://strmfree.pk/api/v1/sources/florida-gators-vs-west-virginia-mountaineers` → `200 {"stream_key":"…","sources":[]}`. The embed's own code polls the same endpoint and only clears "starting soon" once a source with its matching variant is `live`. So the stream is not deliverable, and the page says LIVE throughout.
- The list record has **no `live` key at all**. Our `live: true` at `app/utils/strmfree.ts:93` is hardcoded for the main `iframe`; it is not sourced from anything.
- The embed URL ends `…mountaineers1080p`. No quality is surfaced, so the ladder ranks it last and the chip reads unqualified. Feed chips render `unqualified → SD → unqualified`.

## Fixes

1. **Liveness from the API, not a constant.** Fetch `/api/v1/sources/{stream_key}` and set `live` from whether any source has `live: true`. Treat the stream as not live when the fetch fails or the array is empty. Store `live` per source in the cache shape that `isCachedSupplement` already validates.
2. **Quality from the URL variant.** The embed path's trailing variant maps to the existing ladder: `2160p`/`4k` → 4K, `1080p` → FHD, `720p` → HD, `540p`/`480p`/`360p` → SD. Put it in `sourceTag` so it renders through `sourceLabel` and sorts by `rank`. Unknown or absent variant stays unqualified.
3. **Say so when it is not live.** A supplement chip that is merged but not yet deliverable gets the existing muted treatment and the label mentions it (the wording is yours, keep it to one or two words), rather than a green LIVE claim. It stays selectable — the embed self-starts when the provider catches up, and the page already has the watchdog-free case covered.
4. **Keep the merge cheap.** One extra API call per event that reaches the merge, cached with the sources. Do not poll it in the page; the 10-minute cache and the refresh on re-entry are enough.

## Rules

- `app/**` only. No `server/**`, no bundle-affecting config.
- No new dependency.
- The 3-hour window, two-token match, host whitelist and 10-minute cache stay as shipped.
- Selection, dedupe, `2nd` marker and mobile layout must not regress.

## Verification

Unit-test the variant mapping (every rung plus unknown and absent) and the liveness reduction (any live → live, empty → not live, failure → not live, and the cache validator accepting the stored shape). Then re-verify in the browser against a currently live match that the API still reports `sources: []` — `fla-wvu` if it holds, otherwise the newest live basketball or football event — and show the chip unqualified-but-marked, the quality tag once `/api/v1/sources/{key}` returns a populated array, and the ordering with a mixed set.

Stop condition: `pnpm test`, `pnpm build` and `wrangler deploy --dry-run` pass, and the browser check above is reported honestly, including if the provider never delivered a stream.

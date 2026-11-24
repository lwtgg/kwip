# taifood `/fetch` probe, 2026-11-24 17:0x UTC

Follow-up to rule 26's fallback question and to the queued provider probe in `ROADMAP.md`. Measured from
`taifood-blog.asia/embed/247-fox-cricket` in Chromium 145 with a desktop Chrome UA (its stream host refuses a
`HeadlessChrome` UA), top level and inside a 640×360 frame, fresh context, no Media Engagement.

## What changed since the last probe

`POST https://taifood-blog.asia/fetch` with the event URI as the plain-text body now answers **200** and
`application/octet-stream`, and the returned bytes carry the event slug. It is no longer the plain-text 500 the
earlier note recorded. A bare POST without a body still answers 400, so a health probe must send the URI body
exactly as the player does.

## But playback is still dead

With `#player=clappr&autoplay=1` the Clappr/WASM player loads, fetches `/fetch`, then requests the signed
manifest and its audio variant — and stops. At 12–18 s there is **no `<video>` or `<audio>` element at all**
(the page's DOM is a shell plus an `about:blank` frame and a 1 px PDF object), the visible text stays
`CLICK UNMUTE STREAM / Remove sandbox attributes on the iframe tag`, and the signed URLs themselves are broken:

| URL from inside the manifest | Result |
|---|---|
| `/secure/<token>/0/<minute>/foxcricket/index.m3u8` | 200 while fresh, 403 once the minute token turns |
| `/m/<blob>` redirect target | **404** after redirects |

The manifest is minted per minute (`1795626000`), the segment resolver 404s, so the player buffers nothing and
never reaches a media element. Console shows `The script has an unsupported MIME type ('text/html')`.

## Consequence for our code

- `/fetch` alone is **not** a liveness signal. A probe that only POSTs it would mark taifood healthy while every
  pane is dead, which is the same failure the queued task was written to prevent one layer up.
- Until this is fixed on their side, taifood is the right event's fallback but never the playable top event —
  rule 26's zlive-only ordering already does that, so no ordering change is needed.
- A source-health probe should follow one hop: `/fetch` 2xx **and** a manifest that still resolves, or
  `/fetch` plus the first segment 2xx. Keep it inside the existing subrequest budget.
- No change is needed to the shield sandbox for the *play* half; the venv run had media host requests succeed
  cross-origin inside the frame. The popunder still needs `allow-popups allow-popups-to-escape-sandbox`, which
  remains queued separately.

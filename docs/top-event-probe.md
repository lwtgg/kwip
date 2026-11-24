# Top event probe: can the first slot autoplay muted?

Probe for task 54 (rule 26). Measured 2026-11-24 from about 08:20 UTC, in Chrome for Testing 159.0.8154.6
(Playwright 1.57, new headless, fresh profile, so no Media Engagement score). Report only; no app code changed.

**Harness.** `harness.html` on `http://127.0.0.1:8771` puts the embed in a 640×360 cross-origin iframe with
our `PlayerFrame` attribute `allow="autoplay; fullscreen; picture-in-picture"` (or none). `probe.mjs` waits
10–20 s, then reads every `<video>/<audio>` in every frame (`muted`, `paused`, `currentTime`, `readyState`), JW
state through `jwplayer()`, and the network (requests and bytes from `request.sizes()`). With `CLICK=1` the frame is
created by a real click on the parent page, which is what tap to unmute would look like. Samples: taifood `247-fox-cricket`; zlive
`TSN4` (live) and `skysportsf1-uk2` (dead upstream). Scripts were kept in `/tmp/probe54` and are not committed.

**Tooling trap.** taifood's stream host sends no CORS header to a `HeadlessChrome` UA (m3u8 `net::ERR_FAILED`), so all runs
spoof desktop Chrome. macOS curl rejects taifood's Let's Encrypt `YE2` chain (`ssl_verify_result=18`); Chromium accepts it.

## 1. taifood: JW by default, Clappr on request

The page is an ad loader (`aclib.runPop`, a popunder) plus one line that picks the player from the **fragment**:
`#player=clappr` loads `/js/bundle.js` (Clappr + hls.js), and anything else loads `/js/bundle-jw.js` (JW 8.38.10, hls.js 1.6.5).
Both POST `/fetch` and then load an `*.indianservers.st/secure/…/index.m3u8`. The app code is obfuscated, so these results are behavioural.

| Embed suffix (`/embed/247-fox-cricket…`) | Player | Video | JW `autostart` / `mute` |
|---|---|---|---|
| none, `?autoplay=1`, `?autostart=1`, `?mute=1`, `?muted=1`, `?autoplay=1&mute=1`, `?autoplay=1&muted=1`, `?autostart=true&mute=true` | JW | unmuted, paused, rs 0 | false / false |
| `#mute`, `#mute=1`, `#autoplay=1&mute=1`, `#autostart=true&mute=true` | JW | unmuted, paused, rs 0 | false / false |
| `#player=clappr`, `…&mute=1`, `…&muted=1`, `?autoplay=1&mute=1#player=clappr` | Clappr | unmuted, paused, rs 4 (buffered 9–12 MB) | – |
| **`#player=clappr&autoplay=1`** (also `=true`, with or without `mute`/`muted`) | Clappr | **muted, playing** (t = 7.6–11.0 s) | – |
| `#player=clappr&autoplay=1` after a parent click, `allow=autoplay` | Clappr | **still muted**, playing | – |
| JW (no suffix) after a parent click, `allow=autoplay` | JW | unmuted, paused, idle | false / false |
| `#player=clappr&autoplay=1` with our shield sandbox | – | **no video**; page says "Remove sandbox attributes on the iframe tag" | – |

**Result.** JW ignores every query and fragment tried. `#player=clappr&autoplay=1` gives muted autoplay, forced (it stays
muted even when Chrome would allow sound); mute parameters change nothing. It only works **unsandboxed**, popunder included.

**`/fetch`.** It is not 500 right now: every run got `200 POST https://taifood-blog.asia/fetch`. With `/fetch` forced
to 500 (`fetch500.mjs`, `context.route`), both players render a blank black document with no `<video>`. The embed
page still returns 200, so `PlayerFrame` would count the frame as loaded and show a black box. While `/fetch` is down
you can prove the loader's fragment logic (it's static) but nothing about mute or autoplay, because no media element exists.

## 2. zlive: its own React player on hls.js 1.6.13

The bundle (`/assets/Cmb9Hsv9.js`) parses `useSearchParams()` into defaults `{muted:false, autoplay:true, volume:100, controls,
frame, fit, q, idle, …}`. Booleans accept `1|true|on|yes` and `0|false|off|no`. Keys were decoded from the obfuscated string table.

| URL (`zlive.st/embed/TSN4…`) | Without a gesture | After a parent click, `allow=autoplay` |
|---|---|---|
| no suffix, `?autoplay=1`, `?mute=1`, `#muted=1` (keys it ignores) | muted, playing (its fallback after a refused unmuted play) | **unmuted, playing** |
| **`?muted=1`** / `?muted=true` | **muted, playing** (t ≈ 22 s) | **muted, playing** (`?muted=1` tested) |
| `?muted=1&autoplay=0` | muted, paused, still buffered 16 MB | – |
| no suffix, `allow` omitted, after a click | muted, playing | – |
| `?muted=1` with our shield sandbox | muted, playing | – |

**Exact form: `https://zlive.st/embed/<id>?muted=1`.** The bare URL also looks muted, but only through fallback.
Once anything on our page has had a tap, it plays with sound, and so might a returning visitor with a high
Media Engagement score. That breaks "never on load". Dead channels exist: `skysportsf1-uk2` showed "Stream unavailable. All
sources failed", and `fox8`, `cartoonnetwork-uk`, `la-1` and `boing` never reached `readyState` above 0. Of 8 live-flagged channels tried, 4 played.

## 3. Muting from outside

Static search of all three bundles and the taifood shell found no `window` `message` listener. The only listeners are
WebSockets, Workers, EME and a core-js `setImmediate` polyfill that posts to itself. Neither provider has a postMessage API.
**Parameter only:** zlive `?muted=1`; taifood `#player=clappr&autoplay=1` (forced muted). **postMessage:** neither.
**Our "Tap for sound":** zlive only. Remount the frame without `muted` inside the tap handler; the click's user activation
reaches the frame through `allow="autoplay"`, so zlive plays with sound (measured above), at the cost of a reload and rebuffer.
Not taifood: Clappr stays muted after a gesture and JW stays idle, so sound there needs its own controls, beside a popunder.

## 4. Chrome autoplay, observed

Control page `ctl.html` on `localhost:8772` (cross-site to the harness) calls `play()` on load on a 440 Hz WAV:

| Element | `allow="autoplay"` | No `allow` |
|---|---|---|
| `<video>`, unmuted | `NotAllowedError`, paused | `NotAllowedError`, paused |
| `<video muted>` | resolved, playing | resolved, playing |
| `<audio muted>` | `NotAllowedError` | `NotAllowedError` |
| `<video>`, unmuted, `autoplay` attribute only | paused, no error | – |
| `<video>`, unmuted, frame created by a parent click | **resolved, playing** | `NotAllowedError` |

Without a gesture, unmuted `play()` is refused whatever the frame's attributes; muted `<video>` always plays (muted `<audio>`
does not). `allow="autoplay"` only matters after a gesture on our page, and then it is what lets sound through. Muted
autoplay needs no frame attribute; keeping `allow="autoplay"` on the home frame is what makes zlive's bare URL dangerous.

## 5. Layout: the first slot

Measured on kwip.fyi (`layout.mjs`, hero `section[aria-label="Featured event"] .card-art`):

| Viewport | Hero card | Art box (where the player goes) | 16:9 player in it |
|---|---|---|---|
| 320 | 288 × 275.5 at y=226 | **288 × 162** (16:9) | fits exactly |
| 390 | 358 × 314.9 at y=226 | **358 × 201.4** (16:9) | fits exactly |
| 1280 | 1232 × 320 at y=174 | **718.7 × 320** (`aspect-ratio:auto`, `min-height: --spacing-feature-art`) | needs 718.7 × 404.3 |

Below `64rem` the box is already a reserved 16:9 box, so a frame inside it cannot shift anything. At ≥64rem, either give the
live art box `aspect-ratio: 16/9` (the card grows 84.3 px to 404.3; the poster state gets the same box) or pillarbox a
568.9 × 320 player (74.9 px each side). Either way the box size must not depend on whether the frame mounted.

**Link vs tap conflict.** The whole card is one `<NuxtLink>`. An iframe or button inside an `<a>` is invalid
interactive nesting, and taps inside it would navigate. Proposed split: the art box becomes a labelled sibling of the link;
the link covers the info column only; "Sound on" is a separate `<button>` (`min-h-11`) in the info column next to "Watch",
outside both link and frame, never overlaid on the provider's controls, and shown only for zlive.

## 6. Cost per home view

Today the home page is 36 requests / 926 kB at 320 and 46 / 1080 kB at 1280 (`networkidle`). The frame adds nothing to
our Worker (no subrequests; it loads browser → provider). On the visitor's connection:

| Frame | 10 s | 30 s |
|---|---|---|
| zlive `?muted=1`, playing | 18 req / 15.4 MB | 27 req / 41.9 MB (≈1.3 MB/s, ≈79 MB/min) |
| taifood `#player=clappr&autoplay=1` | 19 network req / 15.4 MB | 22 / 12.7 MB* |
| taifood JW, idle | 15 network req / 0.77 MB | 0.77 MB |

\* taifood bundles a P2P segment loader, so its byte count is a lower bound, not a rate. Third-party runtime rides along: zlive `justice.hls.lol` tracking and `tiktokcdn` assets; taifood an ad exchange and popunder.

**Recommendation.** Mount only when the top event is live by our clock, the art box intersects the viewport (the existing
`PlayerFrame lazy` IntersectionObserver) and the tab is visible. Unmount it when it leaves the viewport or the tab hides:
we can't pause it from outside, and `?muted=1&autoplay=0` still buffers 16 MB. Skip autoplay under `Save-Data`. Autoplay
zlive only, with `?muted=1`. taifood needs an unsandboxed frame with a popunder and shows a black box when `/fetch` fails,
so it takes rule 26's "frame loads paused, row unchanged" branch.

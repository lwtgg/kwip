# Sourcing research: how directories get 5–15 sources, and which of it is ours

Researched 2026-11-18/19 from a residential macOS IP, headless Chrome and a second HTTP egress
(Firecrawl), against live hosts. Everything below is observed unless marked **unverified**.
Where a number appears, it was measured in this session.

Skills read: `writing-plans` (report shape), `verification-before-completion` (claims vs. checks).

## 0. Baseline, measured

- `GET https://api.ppv.st/api/streams` → 178 streams, **471 iframes, every one on `taifood-blog.asia`**.
  There is no second embed host in the feed, not one. (`https://api.ppv.st/api/streams`)
- `GET /api/streams/nfl/2026-11-19/ind-hou` → `sources` length **1**, `substreams` length 1–3,
  `source_tag` values `HD | Prime Video`, `SD | Prime Video`, locale `en`. Sampled 10 events: 1 source
  each, 1–3 substreams, 2–8 total entries, all on one host. **ppv.st yields 2–8 entries, not 5–15.**
- **`ppv.st` is not framable**: `x-frame-options: SAMEORIGIN` and `content-security-policy:
  frame-ancestors 'self'`. Only the `taifood-blog.asia` embed can be framed, never the site page.
- During this session `taifood-blog.asia` was **unreachable from the research network**: TLS
  `errno 54` on 443 from curl, `ERR_CONNECTION_RESET` in Chrome, `503` on plain HTTP, three retries
  over ~90 minutes, while `api.ppv.st` answered normally throughout and Firecrawl's egress got the
  page fine. The "one CDN, one failure mode" risk is not theoretical; it is the current state.
- Worker egress to the provider is already blocked (`{"success":false,"error":"IP blocked..."}`),
  per `docs`-adjacent prompt 11. Browser-side or runner-side fetch is the only live path.

## 1. Embed sourcing topology

Four ways these directories get a source, in descending order of how much they are actually used.

**a. Contracted / keyed provider API.** The serious ones publish an embed programme. `thedaddy.li`
documents a protected API (`daddyapi.php?key=...&endpoint=channels|schedule`), tells webmasters to
use a domain assigned *per stream*, and says plainly "do not share or redistribute embed domains
with other streamers" (`https://thedaddy.li/api.php`, `https://thedaddy.li/webmasters.php`).
`strmfree.pk` publishes a versioned public API with a documented `sources` endpoint and a stated
contract that their own player polls it (`https://strmfree.pk/api`).
*Worth doing at our size: yes, when the API is public.* It is one schema, one failure domain, and
the provider does the matching. Risk: a private domain can be revoked, so never let one provider be
the only one.

**b. Derive the embed URL from the event, and hit the host directly.** A published scraper used
`/embed/admin/ppv-<slug>/<n>` with `n ∈ {1,3,5}` on `embed.st`, now settled in §3.
(`https://pypi.org/project/live-stream-thief/`). `strmfree.st` takes
`/embed/<category>/<slug><variant>` with variants `1080p`, `1080p2…5`, `720p…5` — all 20 variants
are listed in the embed page's own token map. This is the cheapest mechanism and the only one that
scales past a handful of events. Risk: slug form is the host's own kebab-case, so name matching
is fuzzy and must be verified per event; a wrong slug yields a 404 or, worse, another match.

**c. Scrape another aggregator.** `footyLive` merges three upstreams (Streamed.pk, CDNLive,
WatchFooty) behind a Jaro-Winkler matcher and a signed redirect
(`https://github.com/OgBek/footyLive`). `streamed-scrapper` pulls streamed's API then extracts m3u8
from each embed with Puppeteer, 85–95% success on `embedsports.top`
(`https://github.com/jasos24/streamed-scrapper`). Risk: you inherit their outages. `streamed.pk`
is **gone** as of this session — its front page is literally a closure notice naming ppv.st,
strmfree.pk, tim-streams.com, pitsport.st and thedaddy.pk as successors (`https://streamed.pk/`).
Anything built on it in 2025 is now dead.

**d. User submissions.** Not really a thing. `ppv.st/request` is a *event* request form ("Do not
request NBA games, these are added automatically"), not a place to submit a source URL
(`https://ppv.st/request`). Source-level submissions would need moderation we cannot staff. Skip.

**Legal/operational reality, not folklore.** No host claims a licence; all of them are framing
third-party players, same as us. Concretely: `ppv.st` has **no reachable terms, DMCA or about page**
(`/terms`, `/dmca`, `/about` all render the SPA's 404), so there is no published permission to
scrape and no stated rate limit — only `READ_ME: "Interested in using our API? Contact us"` in the
payload. `strmfree.pk/robots.txt` disallows `/api/`, `/embed/` and `/get-stream-key/`, which almost
nobody honours and which we should note but not obey to the letter. The practical exposure of
hotlinking an embed is low: no auth, no key, no quota; the risk is disappearing, not suing.

## 2. Multi-source ranking

Nobody publishes an uptime score. What is actually visible, verbatim:

- `ppv.st` source picker is a button reading `Change Stream (HD | Prime Video)`, and opening it
  lists — in this order — `HD | Prime Video 🇺🇸 English`, `External Player Frame`,
  `SD | Prime Video 🇺🇸 English`. **Quality descending, then broadcaster, then locale flag.**
  `External Player Frame` is the mechanism label, not a quality.
- The ordering is the `substreams` array order: HD entry first, SD second, one broadcaster block
  per feed. Two-broadcaster games (`ABC` + `SkyCast`) produce four entries, still HD-before-SD.
- `strmfree.pk` puts a boolean `live` on every source and returns `quality: "FHD"` first, primary
  embed as `iframe`, the rest as `additional_sources` (`https://strmfree.pk/api/v1/streams`).
- `embed.st` ranks by numeric server index; there is no label at all.
- `thedaddy.li` splits `channels` (primary) from `channels2` ("may contain alternate sources").

So the field's real ranking key is **quality label → broadcaster → locale**, with liveness as a
tiebreak, and "backup" is implicit in position. No one exposes bitrate, and only ppv.st exposes
`viewers` (a per-event string today: 3, 18, 0). Region is a flag, not a filter.

## 3. Public embed hosts worth cataloguing

| Host | Pattern | Event id needed | Framable | Reliability, observed |
|---|---|---|---|---|
| `taifood-blog.asia` | `/embed/<league>/<date>/<slug>`, `/embed/<slug>` for 24/7 | no, path is derivable | yes (frames loaded) | **Carries 100% of ppv.st and was down from one network all session.** Single-host dependency. |
| `strmfree.st` / `streamfree.top` | `/embed/<category>/<slug><variant>`, variant `""`/`1080p`/`1080p2…5`/`720p…5` | no | `x-frame-options: ALLOWALL` | Best of the set. Embed 200 in 0.3 s, token map exposes 20 variants, manifest 200, segments on `*.ttcdn-us.com`. Still 404s once the event ends. |
| `thedaddy.li` | `/{stream,cast,watch,plus,casting,player}/stream-<id>.php` | Public IDs exist. Keyed feed awaits a key. | No framing restrictions in the sampled response headers. Embedded playback **unverified**. | 2026-11-21 · Public wrappers respond. Some aliases return blocked-access bodies. |
| `pitsport.st` | `/programs/<id>/play` | Needs an ID source. The public `/api/v1/home` lists IDs. | No framing restrictions in the sampled player response headers. Embedded playback **unverified**. | 2026-11-21 · Source multiplier in the catalog. Four variants for one event shared one embed origin. |
| `embed.st` | Historical `/embed/admin/ppv-<slug>/<n>` | — | No DNS resolution in the checks below. | 2026-11-21 · Dead at this hostname. Successor **unverified**. |
| `ppv.st` (site) | `/live/<uri_name>` | no | **no** — SAMEORIGIN + `frame-ancestors 'self'` | Useful as a fallback *link*, never as a frame. |
| `cdnlivetv.tv` | `/api/v1/channels/player/?name=<channel>&code=<cc>&user=<user>&plan=<plan>` | Needs an ID source for exact catalog names and codes. | Successful player response **unverified**. | 2026-11-21 · Public free pair works on the catalog. All three player requests returned `401`. |

### Host checks on 2026-11-21

**`embed.st` settled as dead at the sampled hostname.** Local DNS and direct queries to
Cloudflare `1.1.1.1` both returned `status: NXDOMAIN` and `ANSWER: 0`. Cloudflare DoH
returned `HTTP/2 200`, `content-type: application/dns-json`, and `"Status":3`.
Google DoH returned `HTTP/2 200`, `content-type: application/json; charset=UTF-8`, and
`"Status":3`. Both DoH bodies identified the question as `"name":"embed.st.","type":1`
and included the `st` SOA. These checks used one local network. An independent network
path is **unverified**.

- `https://ppv.st/` returned `HTTP/2 200`, `content-type: text/html`, and
  `<link rel="preconnect" href="https://api.ppv.st">`. The linked API at
  `https://api.ppv.st/api/streams` returned `HTTP/2 200`,
  `content-type: application/json`, with 319 `iframe` fields on `taifood-blog.asia`,
  including `"iframe":"https://taifood-blog.asia/embed/nfl-network"`. The mirror
  `https://api.ppv.cx/api/streams` failed with `curl: (6) Could not resolve host: api.ppv.cx`.
- The homepage's linked client bundle `/_app-1/DhnyEgIM.js` advertised
  `https://discord.gg/mVmQWBRPbe`. The invite returned `HTTP/2 301` with
  `location: https://discord.com/invite/mVmQWBRPbe`, then `HTTP/2 200` with
  `content-type: text/html` and the description `Check out the Hub community on Discord`.
  No successor was identified in the retrieved homepage, its linked scripts, the feed,
  or the public invite. Discord channel content and a successor URL remain **unverified**.

**`cdnlivetv.tv`.** The [provider docs](https://cdnlivetv.tv/) returned `HTTP/2 200`
and `content-type: text/html; charset=UTF-8`. The public iframe example contains
`user=cdnlivetv&plan=free`. The [public catalog](https://api.cdnlivetv.tv/api/v1/channels/?user=cdnlivetv&plan=free)
returned `HTTP/2 200`, `content-type: application/json; charset=utf-8`, and
`"total_channels":405`. It returned `"name":"Sky Sports Golf FHD UK","code":""` with
the corresponding player URL and the same pair. That establishes account-free publication
and catalog access on this date. Stability over time and reuse in public playlists are
**unverified**.

The kwip feed returned `"id":29059,"name":"Sky Sports Golf"`. Requests to
`https://cdnlivetv.tv/api/v1/channels/player/` produced:

| Query | Status | Header | Body |
|---|---|---|---|
| `name=Sky%20Sports%20Golf&code=&user=&plan=` | `HTTP/2 401` | `content-type: text/html; charset=utf-8` | `<html><body><h1>401 Unauthorized</h1></body></html>` |
| `name=Sky%20Sports%20Golf&code=&user=cdnlivetv&plan=free` | `HTTP/2 401` | `content-type: text/html; charset=utf-8` | `<html><body><h1>401 Unauthorized</h1></body></html>` |
| `name=Sky%20Sports%20Golf%20FHD%20UK&code=&user=cdnlivetv&plan=free` (exact catalog URL) | `HTTP/2 401` | `content-type: text/html; charset=utf-8` | `<html><body><h1>401 Unauthorized</h1></body></html>` |

**`pitsport.st`.** The homepage returned `HTTP/1.1 200 OK`, `Content-Type: text/html`.
Its linked client bundle calls `/home` under `https://pitsport.st/api/v1`.
`/api/v1/home` returned `HTTP/1.1 200 OK`, `Content-Type: application/json; charset=UTF-8`,
and listed `"programId":103180,"slug":"ufc-fight-night-prochazka-vs-stirling"`. Match against
that upstream list. Derivation of PitSport IDs from kwip IDs or slugs is **unverified**.

- `/api/v1/programs/103074` returned `HTTP/1.1 200 OK`,
  `Content-Type: application/json; charset=UTF-8`, and `X-Frame-Options: DENY`.
  The body included `"playHref":"/programs/103074/play"`, `"liveState":"ended"`,
  and a video with `"origin":"https://embdlol.st","allowed":true`.
- `/api/v1/programs/103180` listed four variants with labels `HD | English`,
  `HD | Spanish`, `HD | Portuguese`, and `HD | Multiview`. All four detail responses
  returned `HTTP/1.1 200 OK` and `Content-Type: application/json; charset=UTF-8`.
  Their bodies paired program IDs `103180`, `103334`, `103335`, and `103336` with
  `"embedId":102542`, `"embedId":102543`, `"embedId":102544`, and
  `"embedId":102545`, respectively. Each contained `"origin":"https://embdlol.st"`.
  This is a source multiplier at the catalog level. Playback and CDN independence are **unverified**.
- Both `/programs/103074/play` and `/programs/103180/play` returned `HTTP/1.1 200 OK`,
  `Content-Type: text/html` and `x-sveltekit-page: true`. Neither response contained
  `X-Frame-Options` or `Content-Security-Policy`. The HTML includes
  `<div id="app-splash"><div></div></div>`. The English variant's child embed also
  returned `HTTP/1.1 200 OK`, `Content-Type: text/html`, with neither framing header. Its
  body contains `<body data-sveltekit-preload-data="hover">`. A successful cross-origin browser frame and playback remain **unverified**.

**`thedaddy.li`.** The public homepage and `/api.php` both returned `HTTP/2 200`
and `content-type: text/html; charset=UTF-8`. The homepage contains
`href="/stream/stream-46.php"`, and the docs publish `/stream/stream-302.php` in their
iframe example. The documented channels endpoint without a key,
`/daddyapi.php?endpoint=channels`, returned `HTTP/2 401`, `content-type: application/json`,
and `{"error":"Unauthorized","message":"Missing API key","code":401}`. Waiting on a key for a
structured provider feed.

All six documented `stream-302.php` routes returned `HTTP/2 200` and
`content-type: text/html; charset=UTF-8`. None included `X-Frame-Options` or
`Content-Security-Policy`. The bodies differed:

| Folder | Body excerpt |
|---|---|
| `stream`, `watch` | `<iframe src="https://dembed.st/premiumtv/daddy.php?id=302"` |
| `cast` | `<iframe src="https://waterera.net/e/pq1gwzp9y0h03"` |
| `plus` | `Access Blocked - Please use official site! : DaddyLive.pk` |
| `casting`, `player` | `Direct access blocked, place iframe embed code on your website.` |

Cross-origin rendering and playback are **unverified**, including whether the last three
aliases behave differently inside a frame.

## 4. Reliability measurement

**What does not work.** `iframe.onload` is worthless: a probe page framed `https://nope.invalid/`
and `https://github.com/` (which sends `X-Frame-Options: DENY`) and **both fired `onload`**. There is
also no `postMessage` in the taifood or strmfree embed HTML (0 occurrences), so the frame cannot tell
us it started. From the page, liveness is a timeout plus the visitor's eyes.

**What does work, from a runner at snapshot time** (measured against a live strmfree stream):

1. Embed page `200` + expected markers in the body (`jwplayer`, a token map). Cheap, catches dead
   hosts — this alone would have flagged taifood all session.
2. Parse the tokens, `GET` the manifest: `200`, `content-type: application/vnd.apple.mpegurl`.
   Manifest TTFB **519–898 ms**, CORS `*`.
3. `EXT-X-MEDIA-SEQUENCE` sampled twice 6 s apart: **2000 → 2002**. Advancing = actually live;
   frozen = a stale manifest that still returns 200.
4. First segment: **200, 4.6 MB, 666 ms** from `p19-…ttcdn-us.com`. TTFB and size are honest.
5. Post-event rot: the same embed URL returned `{"detail":"Stream not found"}` / 404 once the game
   ended. A 404 is a hard, cheap signal; treat it as terminal until the next snapshot.

**The caveat.** Manifest 200 is necessary, not sufficient. In headless Chrome the strmfree player sat
at `pos=0.0 buf=0s` for 60 s with a 200 manifest and live segments; the embed's own debug log
(`?sfdebug=1`) showed `MODE hls.js + P2P` and a frozen position. So rank on manifest health, but
never claim "verified working" from it.

Blanket: no media proxy needed. All of the above is HEAD/GET of the host's own URLs.

## 5. What the provider we already use actually gives us

The full `sources[]` object, verbatim from `/api/streams/nfl/2026-11-19/ind-hou`:

```json
{ "name": "External Player Frame", "default": true, "type": "iframe",
  "data": "https://taifood-blog.asia/embed/nfl/2026-11-19/ind-hou" }
```

That is every field. No host, no quality, no bitrate, no id, no health. Four consequences:

- **`name` is a constant.** Every source is `External Player Frame`, so the picker labels collide
  the moment there are two. The useful identity is `new URL(data).host`, which is currently always
  `taifood-blog.asia` — one host, so identity is trivial today and will not stay trivial.
- **Quality and locale live on the *substream*, not the source**: `source_tag` (`HD | Prime Video`),
  `source_tag_raw` (`Prime Video`), `locale` (`en`). Ranking must key on the substream and then
  attach its single source. `useFeed.ts` already flattens substreams into `sources` with
  `name = substream.name · source_tag` and `default: false` — that is the right direction and the
  only shape the data supports.
- **`default: true` on every source**, including substream-derived ones upstream, so it cannot
  order anything. Order comes from `substreams` position: HD before SD.
- **Failover has nothing to fail over to.** Max 8 entries, one host, one CDN. A ranking and failover
  scheme sits on this shape fine — score = quality rank, then locale, then measured health, then
  `viewers` — but with only ppv.st it is choosing among variants of the same fragile thing.

## Do next, ranked

1. **Source identity and host extraction** — a `sourceKey(url)` = host + path; label from the
   substream; stop rendering the literal `External Player Frame`. 0.5 day. Fixes the picker before
   any second provider lands.
2. **Host registry + snapshot-time embed probe** — table of hosts with pattern and expected markers;
   one fetch per source, store `embedOk`, `manifestOk`, `seqAdvancing`, `segmentMs` next to the
   source. 2 days. This is the whole of §4 and it is per-host parsing, so build it once.
3. **`strmfree.pk` as provider #2** — read `/api/v1/streams` for `iframe` + `additional_sources`,
   carry `quality` and `live` through, map to our source shape. 1.5 days. Only real second CDN
   available today and its API documents the sources endpoint.
4. **Ranking and failover on the merged chain** — quality band, then locale, then probe health, then
   viewers; auto-advance only on timeout or a failed `embedOk`. 1 day. Depends on 1 and 2.
5. **Honest degradation** — when a host's probe is red, badge it in the picker as `degraded` instead
   of removing it; when the chain is exhausted, keep the retry block. 0.5 day.
6. **`thedaddy.li` keyed API** — waiting on a key. Verify embedded playback and aliases before
   counting them as fallback sources. See §3 for the public routes.

## What not to bother with

- **A native `<video>`/hls.js player on the embed's m3u8.** Manifests are token-signed, 403 without
  the embed page's cookie/token pair, and the segment host is third-party. The frame already solves it.
- **A media proxy.** Nothing in §4 needs one; the segment CDN sends `access-control-allow-origin: *`.
- **Scraping `streamed.pk`.** Dead, front page is a closure notice. Retarget anything that assumed it.
- **Puppeteer/headless extraction of m3u8 in CI.** Manifest health can be had with two plain fetches;
  reserve a browser for the manual spot-check.
- **User source submissions.** Unmoderated, and ppv.st's own request form is event-level anyway.
- **Bitrate ranking.** No host exposes it; resolution label is the only quality signal in the data.
- **Viewer-count ranking as primary.** It exists on ppv.st (`3`, `18`, `0` on live events) and is
  useful as a tiebreak, but it is per event, not per source, and 0 on most.

## Sources

All fetched 2026-11-18/19: `https://api.ppv.st/api/streams`, `https://api.ppv.st/api/streams/<uri>`,
`https://ppv.st/live/nfl/2026-11-19/ind-hou`, `https://ppv.st/request`, `https://strmfree.pk/api`,
`https://strmfree.pk/api/v1/streams`, `https://strmfree.st/embed/...`, `https://streamfree.top/embed/...`,
`https://streamed.pk/`, `https://thedaddy.li/api.php`, `https://thedaddy.li/webmasters.php`,
`https://pitsport.st/api/v1/programs/103074`, `https://embed.st/embed/admin/ppv-<slug>/<n>`,
`https://pypi.org/project/live-stream-thief/`, `https://github.com/OgBek/footyLive`,
`https://github.com/jasos24/streamed-scrapper`.

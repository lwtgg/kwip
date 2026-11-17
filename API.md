# Feed contract

Public, CORS-enabled, documented by the provider. Treat every shape below as fact; do not invent fields and do not write defensive code for fields that exist.

**v1 scaffold builds against the committed fixtures in `public/fixtures/`, not the live host.** Same paths, same shapes, `sources[].type` is `link` there (outbound to a rights-holder player) and `iframe` on the live feed. The base URL is config, so swapping fixture → live is `NUXT_PUBLIC_FEED_BASE` alone and no component changes. Set it to `/fixtures` while developing.

Live source, once `NUXT_PUBLIC_FEED_BASE` points at it:

Base: `https://api.ppv.st/api`
Mirror base: `https://api.ppv.cx/api` (host not always resolvable — try primary, fall back on network error only)

All responses are `application/json` and carry `success: true|false`. Errors are `200` with `success: false` and `error: string`.

## GET /ping

```json
{ "success": true, "domains": ["ppv.st", "..."], "status": [] }
```

## GET /streams

Categories with their streams. Poll no more than every 60s.

```json
{
  "success": true,
  "timestamp": 1794880670,
  "performance": 0.05,
  "streams": [
    {
      "category": "Basketball",
      "id": 37,
      "always_live": 0,
      "streams": [
        {
          "id": 32235,
          "name": "Houston Rockets vs. Miami Heat",
          "tag": "NBA",
          "source_tag": "HD | Home",
          "poster": "https://static.ppvservices.st/assets/thumb/<hash>-thumbnail.jpg",
          "blurhash": "LH5r}%YRR*aKj[j@fQa}Dgivt6j[",
          "colors": ["#0080c6", "#241773"],
          "uri_name": "nba/2026-11-16/hou-mia",
          "starts_at": 1794875400,
          "ends_at": 1794886200,
          "always_live": 0,
          "locale": "en",
          "category_name": "Basketball",
          "iframe": "https://taifood-blog.asia/embed/nba/2026-11-16/hou-mia",
          "substreams": [{ "id": 1032235, "name": "...", "uri_name": "nba/2026-11-16/hou-mia_540p", "iframe": "..." }],
          "viewers": "1737"
        }
      ]
    }
  ]
}
```

`uri_name` is the route key. `starts_at`/`ends_at` are unix seconds, `0` for always-live channels. `viewers` is a numeric string. `blurhash` and `colors[0]` drive the poster placeholder.

## GET /streams/{uri_name}

Single stream. Same object as above plus:

```json
{
  "success": true,
  "data": {
    "m3u8": "",
    "source_type": "playlist",
    "sources": [{ "name": "External Player Frame", "default": true, "type": "iframe", "data": "https://taifood-blog.asia/embed/nba/2026-11-16/hou-mia" }],
    "category": 37,
    "auth": false,
    "vip_stream": false,
    "uuid": "",
    "token": ""
  }
}
```

`sources[]` is the playback chain, in order. `type` is `iframe` when the entry is embeddable and `link` when it is a normal navigation; skip any entry whose `data` is empty.

## GET /vods and GET /vods/{slug}

Archive list is categories plus `vods[]` with `id`, `name`, `tag`, `poster`, `uri_name`, `added`, `event_date`, `views`. Detail adds:

```json
{ "source": { "type": "playlist", "data": "https://vod.television.st/<slug>/index.m3u8" }, "recommended_vods": [] }
```

Some strings contain the literal `{host}` — replace it with the current page host.

## Notes

- Categories are numbered in the feed (`id`) but routers key on `category_name` slugified.
- `poster` can be missing; fall back to `colors[0]` as a flat background plus the blurhash.
- CORS allows `*` and custom `X-CID`, `X-FS-Client` headers; we currently send neither.

# Task 26 — edge HTML cache keyed to the generation

The reader works and the account is now Workers Paid, but a cold render still costs 120–240 ms CPU on the listing and ~65 ms on a detail. Add the cache that makes repeat traffic cheap, keyed so a cached page can never outlive the feed generation it was rendered from.

`caches.default` only, no new binding, no dependency.

## Key

Build the key from, in this order:

1. request origin + pathname
2. the served generation identity — `commitId` from the validated manifest, or the literal `seed` when the seed fallback is in use
3. the host, so a mirror or a workers.dev preview never serves an HTML string containing the wrong canonical
4. only render-affecting query params, normalised: `filter` and `source`, sorted, each present once. Everything else (cache-busters, campaign junk) is dropped.

Cache `GET` only.

## What may be stored

Only `200` responses whose `content-type` is `text/html` or `application/xml`, and only when the response has no `Set-Cookie`. Use `waitUntil` so the write never delays the response. Set a TTL of 15 minutes — entries are keyed by generation, so a new one starts cold and old ones simply age out.

Never store `3xx`, `4xx`, `5xx`, an unavailable page, or anything from the seed-on-error path under the generation key.

## Serving

- Look up the key before doing any payload work: read the manifest, build the key, `match`. On hit, return immediately with `X-Kwip-Cache: hit`.
- On miss, render normally, then store in `waitUntil`. Add `X-Kwip-Cache: miss`.
- `caches.default` is absent under `wrangler dev` and in the unbound Node path. When absent, skip both lookup and store and stay silent — no header, no error, unchanged behaviour.
- Apply to the listing, the category page, details and `sitemap.xml`. Do not cache `robots.txt`.
- The sitemap still omits unavailable entries; a cached sitemap is per generation, so it can never list a path the generation dropped.

## Correctness traps to handle explicitly

- **The generation read cannot be skipped.** The key needs `commitId`, so read and validate the manifest first. Do not key on a timestamp, an ETag alone, or anything that survives a republish.
- **Selection state.** `source` changes which chip is `aria-pressed` in SSR output. It is in the key, so it must actually be honoured when rendering — verify, don't assume.
- **The seed key is separate.** A generation that later becomes readable must not be served a seed-rendered page, and vice versa.
- **`Vary`-relevant headers.** Nothing user-specific is in the HTML today. If the freshness bar's origin timestamp is serialised into HTML it is data-derived and fine; say where it comes from so the 15-minute TTL can be judged.

## Budget

Re-measure on the same preview Worker, deployed, with the same tail capture: p50, p95, max, `outcome`, and an explicit hit/miss split per route, with the cache hit on a warm key and a cold key both measured. A hit should be a small single-digit CPU cost; report the actual figure.

## Rules

- `server/**` and `nuxt.config.ts` only if strictly required. No `app/**`, no new dependency, no binding.
- Never cache a response that carried an error status.
- One generation per request still holds across the cache write.

Stop condition: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, `wrangler deploy --dry-run` all pass, plus unit coverage for the key builder (param normalisation, host inclusion, generation vs seed separation) and for refusing to store a `503`. Prove on preview: a hit returning the same bytes, a new generation starting cold, the mirror not leaking the canonical, and `?utm_source=x` sharing a key with the bare URL. Report the hit and miss CPU numbers.

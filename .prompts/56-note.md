# 56 — corrected diagnosis (read before finishing)

The brief's diagnosis is about half right, so re-anchor on this.

**SSR is already fine.** With a cache-buster the event page's `__NUXT_DATA__` carries `match` 76 times; the
earlier "no score anywhere" fetch was an edge-cached HTML entry from before the 52 deploy. `browserRefresh`
is client-only, so the server already reads the generation.

**The defect is the client.** After hydration, `browserRefresh` is true (cross-origin `feedBase`), so the
client refetches `api.ppv.st`, gets the un-enriched listing/detail, and replaces the hydrated state — `match`
disappears from a page that had it. Anything added to the generation is therefore thrown away on every page.

That still argues for the same fix — a same-origin `/api/feed` route and a same-origin default `feedBase`, so
the client reads our generation instead of the provider. It also means:

- the client's refresh must not be able to *downgrade* a payload: verify after hydration that `match` is
  still present on a matched event, not just that the page renders;
- the generation cache key and the 60 s bucket must not serve one generation's HTML/data against another;
- if the route has to proxy, it proxies, but a readable generation always wins.

Scope of "prove it": SSR carries the score, and it is still carried after hydration and a refresh, with the
route being the only feed origin on the client.

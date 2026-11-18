# Decisions

Numbered and settled. Change one only by adding a new entry that supersedes it.

1. **Nuxt 3 with `ssr: true`.** Server rendering is the distribution strategy; do not "simplify" to an SPA.
2. **Tailwind v4** with tokens in `app/assets/css/theme.css`. No CSS-in-JS, no component library at all.
3. **No backend, no database, no scraper in v1.** Data comes only from the feed in `API.md`. If something seems to need a server, write it under Deferred and continue.
4. **Playback is an external iframe** from the `sources[]` array, with a fallback chain. Never attempt to proxy or re-encode media in v1.
5. **No auth in v1.** Account UI goes through `useAccount()`, which returns `null` until v2.
6. **No ads in v1, but slots are reserved** with fixed dimensions via `AdSlot.vue` so v2 does not reflow.
7. **Deploy target is Cloudflare Workers.** Keep Nitro `node-server` working as the escape hatch. Host-specific code only in `nuxt.config.ts` and `wrangler.toml`.
8. **Poster images are hotlinked** from the feed's CDN. `loading="lazy"`, explicit `width`/`height`, `decoding="async"`. No image proxy in v1.
9. **No new dependency** without listing it in the task reply first; one that lands must be justified in a commit message.
10. **All copy is neutral**: "live event", "directory", "source", "player". Never "restream".
11. **TTL 30s edge cache on HTML**, stale-while-revalidate. `/api/*` of our own is uncached.
12. **Dark is the default theme**, light must not be broken.
13. **`kwip.fyi` is canonical.** Mirrors (`kwip.lol` now, any later) serve identical pages but every page emits `<link rel="canonical">` and absolute `og:url` pointing at `https://kwip.fyi<path>`, and every mirror request 301s when `host !== kwip.fyi` (apex and `www` alike, path and query preserved). Canonical host lives in `runtimeConfig.public.canonicalHost`; no literal in components. Mirrors are never linked internally.
14. **The build target is the fixture feed**, `public/fixtures/`, base `/fixtures`. The live provider feed is an adapter chosen by `NUXT_PUBLIC_FEED_BASE` / `NUXT_PUBLIC_FEED_MIRROR_BASE`, and nothing in v1 may depend on who serves it.
15. **`sources[]` is type-agnostic and both types ship.** `type: "link"` renders as an outbound link, `type: "iframe"` as the embed. The fixtures use `link` because they point at rights holders; the live provider feed uses `iframe` because it embeds third-party players. Which one a source is, is the feed's business, not ours — `usePlayerSources()` orders the chain either way. We make no licensed-status claim for the embed feed.
16. **Mirrors are not only SEO.** They also keep the site reachable when a domain is blocked; the 301 in rule 13 still applies, so a blocked primary means a recorded host change, not a rebuild.

## Deferred (do not build, just note)

- Accounts, watchlist, notifications
- Ads and the ad-free tier
- Own player with multi-source health checks
- Search
- Native apps

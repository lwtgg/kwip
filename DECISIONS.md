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
11. **HTML is edge-cached per generation**, never across one: the key carries the served generation, the host and the render-affecting query only. Only `200` HTML/XML without `Set-Cookie` or `Vary` is stored, and an entry dies at the next kickoff or final whistle, capped at 15 minutes. `/api/*` of our own is uncached.
12. **Dark is the default theme**, light must not be broken.
13. **`kwip.fyi` is canonical.** Mirrors (`kwip.lol` now, any later) serve identical pages but every page emits `<link rel="canonical">` and absolute `og:url` pointing at `https://kwip.fyi<path>`, and every mirror request 301s when `host !== kwip.fyi` (apex and `www` alike, path and query preserved). Canonical host lives in `runtimeConfig.public.canonicalHost`; no literal in components. Mirrors are never linked internally.
14. **The build target is the fixture feed**, `public/fixtures/`, base `/fixtures`. The live provider feed is an adapter chosen by `NUXT_PUBLIC_FEED_BASE` / `NUXT_PUBLIC_FEED_MIRROR_BASE`, and nothing in v1 may depend on who serves it.
15. **`sources[]` is type-agnostic and both types ship.** `type: "link"` renders as an outbound link, `type: "iframe"` as the embed. The fixtures use `link` because they point at rights holders; the live provider feed uses `iframe` because it embeds third-party players. Which one a source is, is the feed's business, not ours — `usePlayerSources()` orders the chain either way. We make no licensed-status claim for the embed feed.
16. **Mirrors are not only SEO.** They also keep the site reachable when a domain is blocked; the 301 in rule 13 still applies, so a blocked primary means a recorded host change, not a rebuild.
17. **Design borrows patterns, not code.** `DESIGN.md` is the reference set and its ranking is the order of work. Tokens only, dark first, nothing that needs a dependency without rule 9 sign-off.

18. **Workers Paid is required.** Free gives 10 ms CPU per request; SSR here costs 65–240 ms and dies with `error code: 1102`. Paid is $5/month and holds 30 M CPU-ms. Cold renders are still worth keeping cheap, and a route that can be served without rendering should be.
19. **Freshness does not depend on a deploy.** A GitHub Actions workflow publishes a packed, validated generation to private R2 every 15 minutes; the Worker reads ranges of the newest one and falls back to the bundled seed only when the generation is unreadable. The publisher lives in `scripts/` with its own lockfile, so nothing runner-only reaches the Worker bundle.
20. **A missing path in a valid generation is authoritative.** Never back-fill one hole from the seed; render the normal unavailable state. Retry the seed only for the whole response, and only when the generation itself cannot be read.
21. **The refresh is triggered from outside GitHub.** GitHub's scheduler has never fired a `schedule` event for this repository, so `kwip-feed-cron` (a scheduled-only Worker on a five-minute trigger) dispatches the workflow when the manifest is missing or older than twelve minutes, skipping while a run is queued. The GitHub `schedule:` trigger stays in place so both converge if it recovers; duplicate dispatches queue behind the workflow's concurrency group rather than publishing twice. The pinger is a trigger, not a monitor — thresholds and alerting stay in the workflow.
22. **Money is our own click-under plus reserved banner slots.** The first qualifying source click per session opens an advertiser in a new tab through our own `/go/<placement>` redirect while the stream still loads in ours; 24/7 channels are excluded. Banners sit in fixed-dimension slots so nothing reflows, and never above the player. A homepage redirect is never taken — the event page is the product. Both sit behind `runtimeConfig.public.ads` and everything must still work with an ad blocker on. Ads are the only third-party runtime allowed on the page, which means v1 is no longer anonymous-by-default, and copy must stop claiming ad-free once the flag is on. Supersedes rule 6.

## Deferred (do not build, just note)

- Accounts, watchlist, notifications
- Own player with multi-source health checks
- Search
- Native apps

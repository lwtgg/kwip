# Decisions

Numbered and settled. Change one only by adding a new entry that supersedes it.

1. **Nuxt 3 with `ssr: true`.** Server rendering is the distribution strategy; do not "simplify" to an SPA.
2. **Tailwind v4** with tokens in `app/assets/css/theme.css`. No CSS-in-JS, no component library at all.
3. **No backend, no database, no scraper in v1.** Data comes only from the feed in `API.md`. If something seems to need a server, write it under Deferred and continue.
4. **Playback is an external iframe** from the `sources[]` array, with a fallback chain. Never attempt to proxy or re-encode media in v1.
5. **No auth in v1.** Account UI goes through `useAccount()`, which returns `null` until v2.
6. **No ads in v1, but slots are reserved** with fixed dimensions via `AdSlot.vue` so v2 does not reflow. Superseded by 22.
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
21. **The refresh is triggered from outside GitHub.** GitHub's scheduler has never fired a `schedule` event for this repository, so `kwip-feed-cron` (a scheduled-only Worker on a five-minute trigger) dispatches the workflow when the manifest is missing or older than twelve minutes, skipping while a run is queued. The GitHub `schedule:` trigger stays in place so both converge if it recovers; duplicate dispatches queue behind the workflow's concurrency group rather than publishing twice. The pinger is a trigger, not a monitor. Superseded in part by rule 23: alerting moves into the pinger;
thresholds stay where the manifest age is already known.
22. **Money is our own click-under plus reserved banner slots.** The first qualifying source click per session opens an advertiser in a new tab through our own `/go/<placement>` redirect while the stream still loads in ours; 24/7 channels are excluded. Banners sit in fixed-dimension slots so nothing reflows, and never above the player. A homepage redirect is never taken — the event page is the product. Both sit behind `runtimeConfig.public.ads` and everything must still work with an ad blocker on. Ads are the only third-party runtime allowed on the page, which means v1 is no longer anonymous-by-default, and copy must stop claiming ad-free once the flag is on. Supersedes rule 6.
23. **The refresh alarm lives in the pinger, not in the thing it reports on.** `kwip-feed-cron` already reads
the manifest age every five minutes, so it is the only place that can tell a stopped refresh from a slow one
without another scheduler. It pages on sustained failure only — a 45-minute age across consecutive ticks,
`stalled`, a dispatch rejected twice, dead or expired credentials, a paused workflow — stays silent for the
first fifteen minutes, for a single provider failure and while `collector-state.json` carries `paused: true`.
One labelled issue is the state: comment at most every 30 minutes, close on the first healthy tick. It
authenticates on its own `GITHUB_ALERT_TOKEN` so the alarm survives the credential it reports on. Alerting is
best-effort and must never change a tick's refresh outcome, and it is bounded to five extra subrequests, six
on a cleanup tick. Supersedes the alerting clause of rule 21.
24. **The artwork is ours.** Every event's visual is built in CSS from its own team colours plus the two team
logos from the score match (rule 25) — a two-team gradient, the logos, and `vs`. Provider thumbnails are no
longer the default art and are not fetched. Home/away decides the sides: away on the left, home on the right.
No match, no logos, a missing colour or a failed logo all degrade to the gradient and the existing
`PosterFallback` monogram — never to a hole. Logos are hotlinked from the score provider's CDN with an
explicit box, `loading="lazy"` and `decoding="async"`, and no image proxy. Supersedes rule 8.
25. **Live scores are best-effort enrichment, never asserted.** The collector reads one public scoreboard per
league per tick and matches it to our fixtures by league, team and date; the result is published in the
generation as away/home `{ name, abbreviation, color, logo, score }` plus a state and a detail line (`Live`,
`Q3 7:42`, `Halftime`, `Final`). Which side is away comes from the provider, never from our fixture name
order. A fixture with no match renders exactly as today, with no partial score. The generation is the trust
boundary: the page renders what it carries and never fetches scores itself. Scores keep the same refresh
clock as everything else — a stopped refresh shows an older score and the existing stale notice, not a
guessed one.
26. **The first home slot is the top event.** It is the highest-viewed event that is live (rule for the rest
of the ordering unchanged), falling back to the soonest kickoff when nothing is live. Live, it mounts its
player automatically and plays muted, so the front page shows a stream without a click; sound is opt-in on
tap and never on load. The card stays a link and the player is a second, separate target. An auto-mounted
top event does not itself count as the money click of rule 22 — that stays the first source click inside the
event page. Autoplay is only assumed where the source accepts it; where it does not, the frame loads paused
and the row is unchanged.


## Deferred (do not build, just note)

- Accounts, watchlist, notifications
- Own player with multi-source health checks
- Search
- Native apps

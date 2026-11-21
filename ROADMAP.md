# After v1

Ordered by what unblocks what. Not a commitment; a queue.

## 1. Freshness (live)

The Worker cannot reach the provider, so the directory only refreshes on deploy. Every other improvement is polish on stale data until this is solved. Target: listings and detail pages that are at most a few minutes old, without a human deploying.

**Shipped.** The [freshness design](docs/freshness-design.md) recommended a five-minute GitHub Actions pilot that publishes complete feed snapshots to private Cloudflare R2 independently of Worker deploys. The Worker keeps the bundled snapshot as a fallback and the browser continues to refresh directly. The pilot is running from GitHub Actions every 15 minutes against the production bucket, with the Worker serving the newest generation and an edge cache keyed to it. Still owed: an independent alert for a missed or `paused` refresh, and a provider answer on the permitted interval.

## 2. Sourcing

Today's provider is the best found so far, but it is one provider with one failure mode and one CDN. Goals:

- catalogue how competing directories source media (which hosts, which embed styles, how many per event)
- raise the source count per event, ranked by quality, so failover has somewhere to go
- record per-source reliability over time and demote the ones that rot
- never host media

**Shipped so far.** Source health (step 2, most of step 5): registered hosts are probed at publish time, the result rides the generation, and a failing source sinks within its own quality and locale band and carries a `degraded` chip without being removed. Second provider (step 3): `strmfree.pk` sources are matched and merged in the publisher, probed like any primary, and the browser fetch survives only as the fallback for generations that carry no supplement. Still owed: the `thedaddy.li` keyed API and health history beyond the current generation. `embed.st` was [settled as dead on 2026-11-21](docs/sourcing-research.md#host-checks-on-2026-11-21).

## 3. Money

Competitors make far more than their quality justifies. Research is done (`docs/money-research.md`) and rule 22 sets the shape: our own click-under plus reserved banner slots, both behind `runtimeConfig.public.ads`, nothing above the player, never a homepage redirect.

- Click-under: shipped in `70d75cc`, live in production. `/go/<placement>` 302s with no referrer. The destination is the house campaign until an advertiser exists, then one env change.
- Banner slots: shipped in `f42c8a1`, live in production in `event-banner` only. Fixed dimensions, no reflow. Creatives come from `/banners/<file>` over the `BANNER_ASSETS` R2 binding, so a sold banner is an upload plus config, not a deploy.
- Copy: shipped with the flip. In-app copy never used "ad-free", so the work was the homepage meta description, the About page, `AGENTS.md`, `.prompts/00-framing.md` and this doc. All now say ad-supported.
- The last step is a sold creative. The house campaign proves the path; replacing it is an R2 upload and a config change, with no code deploy.

## 4. Live data

Score, clock, period, lineups, per-player numbers, driven from the match rather than the listing. Two layers: match state next to the player, and a stats panel that appears only when a game is on. Needs a data provider with a usable free tier.

## 5. De-vibecoding

The design pass fixed the mechanics; the look is still generic. Target the things that read as generated: default type scale, evenly rounded cards, one accent doing every job, no editorial hierarchy, no texture. Budget a real art direction pass with reference sets, not another item list.

## 6. Long tail

Dead-stream health signal, per-event poster quality, 390 px sweep, archive search, per-category OG art.

"Not live" is verified in `tests/notLive_browser.py` against intercepted status endpoints at both widths: only a confirmed-offline variant is chipped, it stays selectable, a failed status leaves liveness unknown and unlabelled, and failover prefers a live equal-quality variant. The provider status endpoint is the only source of `false`.

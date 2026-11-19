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

## 3. Money

Competitors make far more than their quality justifies. Study how — ad networks, ad density and placement, redirect/underlay players, popunder economics, what the paid tiers actually sell — and write down which of it we are willing to impose on a page that currently has none.

## 4. Live data

Score, clock, period, lineups, per-player numbers, driven from the match rather than the listing. Two layers: match state next to the player, and a stats panel that appears only when a game is on. Needs a data provider with a usable free tier.

## 5. De-vibecoding

The design pass fixed the mechanics; the look is still generic. Target the things that read as generated: default type scale, evenly rounded cards, one accent doing every job, no editorial hierarchy, no texture. Budget a real art direction pass with reference sets, not another item list.

## 6. Long tail

Dead-stream health signal, per-event poster quality, 390 px sweep, archive search, per-category OG art.

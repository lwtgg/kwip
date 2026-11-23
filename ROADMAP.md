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

The owner asked for the per-player layer on 2026-11-23; the shape is noted under §6 (a Stats view on the
player surface). It needs a data provider first, so §2's provider work is the dependency.

## 5. De-vibecoding

The design pass fixed the mechanics; the look is still generic. Target the things that read as generated: default type scale, evenly rounded cards, one accent doing every job, no editorial hierarchy, no texture. Budget a real art direction pass with reference sets, not another item list.

**Shipped 2026-11-21.** Direction chosen: broadcast listings. Condensed display and mono numeric tokens,
hairline rules over card boxes, the radius cut to a listing value, accent reserved for action, live rule
and focus, CSS-only texture in the shell, designed state glyphs, the hero Next up strip, and an opt-in
per-source player shield scoped to the event. Tokens only, CLS 0, both themes and widths, all suites green.

**Superseded 2026-11-22.** The broadcast treatment was replaced by a fixture list on the Touchline ramp:
sentence-case SF rows with a fixed time/status column, one mint action, selected source at the frame edge,
stale/empty/error states qualifying themselves. See `PRODUCT.md` and `docs/redesign-45a.md` §Direction A.

## 6. Long tail

Dead-stream health signal, per-event poster quality, 390 px sweep, archive search, per-category OG art.

"Not live" is verified in `tests/notLive_browser.py` against intercepted status endpoints at both widths: only a confirmed-offline variant is chipped, it stays selectable, a failed status leaves liveness unknown and unlabelled, and failover prefers a live equal-quality variant. The provider status endpoint is the only source of `false`.

**Deferred:** crest card art. `tim-streams`/`strmfree`/`strmcrnr` all derive card art from public
league CDNs (ESPN `a.espncdn.com/i/teamlogos/...` verified `200`, soccer by numeric id). Same composite is
reachable from our `name` and `colors`, but it needs a curated team-alias table and two extra requests per
card, so it waits until the supplement work lands.

**Idea (owner, 2026-11-23): a Stats view.** Live player and team statistics inside the player surface,
for supported live and recorded events, as a tab next to the sources rather than a page away. The
directory already knows the two teams from the fixture name, and league summary APIs publish the same
figures, so this is a read of someone else's JSON, not new media. Open questions before it can be
briefed: which leagues actually carry per-player data, how it is attributed when our name match is a
guess, refresh cadence, and what the view shows for the 24/7 channels that have no fixture at all.

**Parked mid-flight (2026-11-23).** `task/47-zlive` (commit `c3eb865`, brief `.prompts/47-zlive-supplement.md`)
implements zlive as a 24/7 supplement. The implementer's gate passed and `pnpm test` (143) plus `pnpm build`
re-verify green on the branch, tree clean, nothing merged or deployed. The review against
`.prompts/47-review.md` never completed — the reviewer sat in model-capacity retries. Next session: finish
that review (it failed on two defects: `SourceSelect.vue:65` fixes the ordinal by origin so a Primary+zlive
channel still says "4th", and `PlayerFrame.vue:167` has no lazy attribute on the frame), fix those, then merge, gate, upload with `/tmp/kwip-flip.toml`, deploy and verify.
Production is `c334cc52` (restore layout).

**Shipped 2026-11-23.** zlive is live as a 24/7 supplement (`bfe8fb6`, version `418829b9`). The first
production generation after the deploy carried it: `nfl-network` serves a zlive FHD
chip as the second provider, our primary stays the default, and no event page carries one). Their host
began refusing TLS from here (`curl` and Chromium both `000`, connection reset) about twenty minutes after
the publish, so embed playback is unproven in production and the frame stays lazy and inert meanwhile.
Re-check `https://zlive.st/embed/<id>` when their host returns.

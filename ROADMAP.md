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

**Direction (owner, 2026-11-23): steal Apple Sports, on the web.** The owner rejects the current look and
wants the Apple Sports iOS treatment rebuilt as a website: score-forward cards, team logos at the centre,
huge compact tabular numerals, team-colour tinting behind each card, favourites driving the top of the
screen, one game sheet with dense numbers underneath, minimal chrome and no onboarding. Public reading to
start from: Apple's own press release, Lickability's critique (vibrant label stacking, the variable-width
display axis, the collapsing nav) and Six Colors' comparison with ESPN. Constraints that survive: we host
nothing, the banner stays below the player, mint keeps one action, and the fixture list's date strip stays
the spine. Depends on crest art, and scores need a provider — start with crest and numeral layout, slot real
scores in when §4's provider exists.

**Shipped 2026-11-23.** The watchdog is deployed on `kwip-feed-cron` (`6462c1de`, merged `549c94a`). A live
tick logged `decision: fresh`, `alert.action: none`, `alertSubrequests: 0`, so healthy ticks pay nothing.
Still owed by the owner: `GITHUB_ALERT_TOKEN` does not exist yet, so alerting falls back to the refresh token
and will log `missing-issues-scope` on the first page. Create a fine-grained token for `lwtgg/kwip` with
Issues: Read and write, then `wrangler secret put GITHUB_ALERT_TOKEN --config worker-cron/wrangler.jsonc`
and give the refresh token Issues: Read and write as well.

**Provider probe: taifood's own fetch endpoint (queued 2026-11-24).** On 2026-11-24 taifood's player host
`taifood-blog.asia` served its embed and bundle but returned plain-text `500` from `POST /fetch` for every
event including nonsense input, so every event page rendered a dead pane; the provider confirmed the outage
and it reproduced on cellular, so it is their handler, not a block. Our source health only reads provider
status responses, so nothing marked the source dead and no supplement was preferred. Add a bounded
server-side probe of the embed's `/fetch` (POST, URI body, 500/405/non-JSON = dead) into the collector's
source health, keep it inside the existing probe budget/subrequest caps, and have a dead primary fall back to
a working supplement when one exists. Frame stays lazy and inert on a dead source.

Probed 2026-11-24 17:00 UTC (`docs/taifood-fetch-probe.md`): `/fetch` now answers 200 with the URI body, but the
signed manifest's segment resolver 404s and the player never creates a media element, so the outage moved one
layer down. **A `/fetch`-only probe is therefore not sufficient** — follow one hop to the manifest or first
segment and treat a 403/404 as dead.

**Shipped 2026-11-24. Task 51 — the listing is a row.** Version `1b186e32`, branch merged `805ac2d`, `main`
pushed. Two review rounds failed first: round one on eleven defects (proportion 2.12:1, wrapped labels, the
lane as a shared prefix, lane prefix repeated, `Watch` heavy, hero empty block, Next up two columns), round
two on the three edges those fixes exposed — a wrapped note dropped the row to 2.91:1, a fixed lane split
`06:44` at 200 % text, and the card test excused both with a 2.87 floor. Final state: every state ≥3.5:1 at
320 (worst 3.56, then 4.42 at 390), the laned time never breaks at 200 % (96 → 48 px tall, one line), the
test floor is 3.5 with no exception plus an unbroken-numeral assertion. Production verified at 320/390/1280,
both themes: no horizontal overflow, no truncated league label, banner still below the player, canonical and
`og:url` absolute on every page, `/vods` 200, unknown path 404, tint contrast worst 5.25. Known pre-existing
gap: at 200 % text the header grid (unchanged by 51, last touched `f396a24`) overflows 320 px by 80.

**Direction (owner, 2026-11-24): scrap the provider thumbnails, own the art, score it.** The owner drew two
mockups: a top event with the stream already playing muted beside a scoreboard, and a row whose plate is a
two-team banner with logos, score and status. Provider posters stop being fetched; our own gradient/logo/
score banner replaces them on the row and the hero, with `PosterFallback` still covering the no-match case.
Live scores are best-effort enrichment from ESPN's public scoreboard, matched server-side per league in the
collector (rules 24 and 25). The first home slot becomes the top event and mounts its player, muted, with
sound opt-in (rule 26). Queue: 52 data and contract, 54 autoplay probe, 53 banner rendering, 55 top event,
60 the scoreboard grid, 61 a banner for every event, 62 the hero player beside the plate, 50b dated listings.

**Paused at the end of 2026-11-25.** Codex hit its credit limit during 60 and Claude ran 60 to a committed,
self-gated state on `task/60-scoreboard` (`ae0439b`) — state between the logos, audience under the detail, the
timeline in the bottom row, six red controls, 199 tests and every suite green, `docs/redesign-60.md` recorded.
**Not reviewed and not deployed.** The review was killed the moment the session ended, so the branch is a
claim, not a result. Open in the CSS: `.banner-status > * { grid-column: var(--banner-middle) }` (0,1,1) beats
`.banner-progress { grid-column: 1 / -1 }` (0,1,0), so the track may be confined to the middle column between
the scores while the doc claims it runs abbreviation to abbreviation — settle that first in review one.

**Paused again 2026-11-25, after 60 shipped.** 60 merged (`6f62cf3`) and deployed (`f2824e5e`); track, order,
audience and the full gate are green. Production then showed the hero state about 4 px below the digit ink at
1280: `inkOffset()` builds a canvas font from the whole computed family list, Chromium resolves Arial Narrow
(ascent 120) instead of Acumin (115), and the offset is ~5 px wrong. The fixture harnesses resolved the first
family, so three reviews and the gate passed it. Round four is briefed and unrun at
`.prompts/60-r4.md` on `task/60-scoreboard` (`137fb9c`); the two checks in flight were killed with the machine.
**Paused 2026-11-26 for the night, with 60b in flight.** 60 shipped and is live (`54739326`), but the owner came
back on it: the logos are still too high. He is right, and the reason is that the fix centred the *padding*, not the
*row* — measured on production, the score row's centre sits 25.34 px above the card's centre at 390 and 1280 while
both pads are 8.00 px. So production keeps a known visual fault tonight. `.prompts/60b-row-centre.md` is the brief
(row centre = card centre, 2 px bound from layout and from 4x paint, bottom clearance kept, the equal-padding rule as
the red control). A draft is committed unreviewed and ungated on `task/60-scoreboard` at `76bca05`: `1lh`-based
`--banner-lower-block` with `:has()` tier counting, and the hero `min-height` removed through
the `--banner-hero-height` token. Resume by gating and reviewing it, then re-verify, redeploy, and re-check the
row-centre figure on production before anything is called done again.

**Shipped 2026-11-26. Task 60 — the scoreboard grid, done in ten rounds.** Version `54739326`, merged `75833c5`.
The row is centred in the card (symmetric padding, so the gap above equals the gap below), the hero leading is
`0.8` from a 128-cell sweep, the hero score and logo stop growing at the same viewport, and the ink nudge takes
its baseline from layout instead of a canvas ascent. Ten rounds of review produced a pixel oracle that reads ink
at 67.5 % alpha coverage, compares it to the canvas model with a per-fixture-calibrated bias (0.41 / 0.27 px
inner, 1.3 device px outer) and gates 320-2560 at four DPRs in Chromium and WebKit. Production `54739326`:
gap difference 0.000 px on 240 live banners, track on 60/60, 50/50 absolute canonicals, zero overflow, zero
page errors; the injected scored-feed pass adds hero ink 0.50 px worst, fill 83.0 % minimum, gap ratio
0.83-1.17. The live feed was entirely "Upcoming" with no scored match during verification, so score, hero and
Play figures come from that injected pass — supporting, not live. Follow-ups below. 61 follows.

**Recorded 2026-11-26, review ten, not scheduled** (test-only): the DPR 4 parity inner limit has 0.009 px of
headroom under omit-and-refit, so the next fixture can go red — refit on a corpus whose held-out fixtures are
genuinely distinct (the "team name" fixture duplicates "Fourth" on state and scores); the `Overtime` fixture
reaches the 1.25 px centring bound exactly at every width, so the next device-row step would fail; the three new
fixtures skip the dead-band and gap assertions; listing digit fill is 57.6-59.3 % against a hero-only 60 % floor;
the header overflows the page at 200 % root text (pre-existing). The parity gap definition in the record means the
space under the track row, not under the status tiers — the literal reading is 17-42 px short by design. Playwright
WebKit's `screenshot(style=)` captures a restyled banner unpainted, so the harness injects a `<style>` element
instead.

**Shipped 2026-11-26. Tasks 60c and 60d — the banner's lower block, and a live score that moves by itself.**
Version `07d96e2d`, merged `1a150bd`. 60c puts the state line in its own element above the row, keeps logos,
digits and name below it, sets the detail level with the score ink, aligns logos to the row's bottom and bounds
the name gap; the hero logo is back to 102 px with the score at 0.76-0.785 of it (ink, both engines, 320-1280).
60d clamps a live page's cache boundary to 60 s, refetches the same-origin feed on the same beat, moves the
freshness notice to ten minutes, renders the item's own match on the detail page and polls it across kickoff
until `post`. Two re-reviews approved (the second with nits, all recorded here). Production `07d96e2d` at 1280
and 1440: the state ink centre lands 0.2653 / 0.2703 of the card above centre against the mockup's 0.28, score
ink 0.3232 / 0.3176 of card height against 0.27-0.32, detail within 2.75 / 5.0 px of the score ink centre, state
clearance 17.5 / 20.5 px, row centre 2.8 px. A 70 s production watch saw `/api/feed/streams` at 60.7 s; the
snapshot had not republished, so the digits were unchanged, which is the publish floor and not a defect.

**Recorded 2026-11-26, from the 60c/60d reviews and production, not scheduled.** Real logos are padded: `fitText`
reads the logo's *box* for both the name gap and the stacked check, so on production (ESPN marks, ~27 % transparent
padding) the score ink is 1.05-1.07 x the drawn logo and the name gap 0.40-0.41 x it, against the mockup's
0.47-0.56 and 0.12-0.18. The suite only uses tight square icon fixtures, so it never saw this. Fix by measuring the
painted logo (canvas ink with a box fallback when the CDN taints it) and adding padded-icon fixtures. Also unscheduled:
kickoff shifts the player 12 px and CLS 0.031 (`[...uri].vue:893`); a `pre` match whose window has ended polls
forever with a stuck "Upcoming" pill; the opening alarm ignores `document.hidden` and there is no refresh on
`visibilitychange`; the retry test passes regardless of `retry()`'s branch; the server picks a related category by
containment while the client matches `category_name` slugs.

**Recorded 2026-11-27, upstream.** `ppv.cx` stopped resolving: `api.ppv.cx` and the apex both answer NXDOMAIN at
Cloudflare DoH and `1.1.1.1`'s records are stale cache, and the IPs Cloudflare still hands back abort the TLS
handshake with alert 40 for SNI `api.ppv.cx` (both 104.21.69.111 and 172.67.207.188, while `kwip.fyi` on the same
IP is a clean 200). A manual `publish:feed --bucket kwip-feed-prod` fails with `fetch failed` after one provider
request. Production keeps serving the last snapshot and, correctly, marks it: the freshness notice and
"Unconfirmed · Last listed" on every card. So an end-to-end proof that a live digit moves on a publish boundary is
blocked on their DNS, not on us. Separately, the stale notice reads "more than 20 minutes ago" while the cut is
ten — copy bug, fix with the padded-logo round.

**Superseded 2026-11-25 12:45, kept for history.** Round three passed, 60 merged and deployed, then production
showed the row sitting
high (4 px above vs 8 px under; 23.6 vs 35.6 on the 1280 hero). Two reviews refuted the first diagnosis — Acumin's
`@unicode-range` is digits-only, so layout and canvas both use Arial Narrow and the ink model was right. Round four
fixed the real fault (symmetric padding, hero leading, layout baseline instead of canvas ascent, a pixel oracle in
Chromium and WebKit); round five gave the leading headroom after a WebKit 1.617x gap. **On `task/60-scoreboard` at
`816a55b`, unreviewed, undeployed.** Review five was started and killed with the session; the prompt is
`/tmp/60-review5.md` if it survives, otherwise rewrite it from `.prompts/60-r5.md`. Then production pixel
verification in both engines with engine/DPR/OS recorded, then merge. 61 follows. Open follow-ups: header overflows
at 200 % root text (pre-existing), rail rows not in the ratio table.

**Shipped 2026-11-24. Tasks 53 and 58 — the banner is the whole card.** Version `b4cba298`, branch merged
`4737a5e`. A matched card is now only the banner, per the owner's mockup: state, scores either side of the
provider detail, abbreviations and viewers on the outer edges, no category line, fixture sentence, UTC or
"Watch". The full accessible label moved to `sr-only`. Provider posters are gone; the plate is our gradient,
logos and score, and the card is full-bleed over the row radius at 3.5:1 or taller where tiers stack. Status
text wraps natively — no spans, no segmenter — with `white-space: normal; width: min-content` measuring the
widest unbreakable unit, `keep-all` on tiers containing Hangul so Korean words stay whole, and a monospace
fallback only where one unit genuinely beats the row. The test asserts one client rect per grapheme and per
Hangul word in SSR, Segmenter-deleted and hydrated renders; seven review rounds, all findings fixed. Production
at 320/1280: banner width equals card width, no overflow, zero hydration errors, canonical and `og:url`
absolute, `/vods` 200, unknown path 404, `/go/event-banner` 302 to the house campaign. Full record in
`docs/redesign-58.md`. Known trade: `keep-all` covers a tier, so Han sharing one with Hangul stops breaking
per character and that card stacks.

**Shipped 2026-11-24. Task 55 — the top event plays itself.** Version `7a71be9c`, branch merged `2c96e33`,
rules 26 and 27. The first home slot is the highest-viewed live event carrying a resolved embed, zlive first,
and only that slot mounts a player: a reserved 16:9 box under the banner plate, the plate staying the link.
Mount only while the box is in the viewport and the tab is visible, always muted, sound opt-in on a tap.
Five review rounds; the failures they caught were a label that described neither action nor state, a visible
button with the player below the fold, consent keyed on object identity so any refresh killed a playing frame,
and a taifood→zlive upgrade autoplaying under Save-Data. All fixed: the unmounted button is always `Play` and
scrolls the box into view, consent is keyed per `uri_name` + embed and survives same-hero refreshes, the hero
sandboxes zlive only. `hero_embed` is a documented, validated listing field that the publisher projects and
the reader strips if invalid. Production at 320/1280: 164 matched banners with zero width mismatch, hero box
16:9 at 288×162 and 1232×693, no overflow, zero hydration errors, canonical and `og:url` absolute, `/vods`
200, unknown path 404, `/go/event-banner` 302 with the creative key. Open: the desktop hero box is 693 px in
an 850 px viewport, and taifood's own playback is dead provider-side, so most heroes have no working picture.

**Defect found and fixed 2026-11-24 — a deploy leaves cached HTML pointing at dead assets.** Task 57
adds the runtime build identity to the HTML cache key alongside the feed generation and host. Previous-build
entries become unreachable and expire under the existing TTL rules. A real two-build Wrangler cache proof
returned a miss naming live CSS after rebuilding, then a hit naming the same live CSS. Removing the build
parameter reproduced a hit naming the deleted CSS hash. Commands, observed headers and mutation evidence
are in `docs/verification-57.md`. Committed locally; not deployed by this task.

**Defect found and fixed 2026-11-24 — 56 was inert in production.** Task 56 made `/api/feed` the default feed
base, but `.env` (untracked, baked at build) and the deploy `[vars]` both still pinned
`https://api.ppv.st/api`, so the client hydrated straight from the provider: every `match` was dropped on
hydration, all 175 banners vanished, and the same-origin route went unused while the provider took the traffic.
Fixed by setting `.env` to `/api/feed`, dropping both feed vars from the deploy config, and redeploying
(`a4839204`). After the fix, a reload at 320/390/1280 keeps 175 banners through hydration and makes zero
provider requests. Rule for future work: the deploy config must not re-pin a value the code already defaults,
and a base-URL change must be verified on the *client* request log, not only on `curl /api/...`.

## Generation-first replay decoder

Add support for devalue null-prototype objects and `Reactive` wrappers in
`tests/generation_first_browser.py`. Task 60 review reproduced the same
`TypeError` on `main` and the scoreboard branch with the same packed generation.
The corrected scratch decoder passed SSR and hydrated replay at 320, 390, 1024 and
1280 px. Bring that coverage into the repository replay harness.

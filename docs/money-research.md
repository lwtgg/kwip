# Money research: what the category earns, and what it would cost a page that has none

Researched 2026-11-19/20 from a residential macOS IP in headless Chrome (Chrome 157, real Chrome UA,
1280×577) plus a curl egress. Seven live hosts were loaded and their network traffic recorded.
Everything is **observed** unless marked **estimated**, and every estimate carries its basis and a
confidence label. Where a claim could not be verified it says so.

Skills read: `writing-plans` (shape), `verification-before-completion` (claims vs. checks),
`agent-browser` (measurement method).

One finding reframes the brief, so it goes first: **v1 was never ad-free in practice.** Three of the
three embed-fed sites tested fire a popunder when the visitor clicks the player, and we frame one of
those same embeds. Our page already carries a third-party ad library (`aclib`) and hands a new tab to
whoever wins the auction. Since the flip the page also carries our own few ads, one banner and one
click-under, while the embed's popunder still fires underneath and is not ours.

## 1. The traffic model

These are not publications with a homepage. They are **sets of event-shaped landing pages**, and the
unit of value is one click on one player.

What is indexed and linked, verbatim: `thestreameast.gold/Atlanta-Hawks-vs-Boston-Celtics/79154`,
`vipbox.live/watch/basketball/notre-dame-vs-auburn/526878`, `ppv.st/live/nfl-network`. Hubs exist but
are navigation, not destinations: footybite's event pages are thin stubs that say "how to watch … live
streams Online" and carry no player before kick-off. Nobody optimises a homepage — vipbox's is a sport
list, and totalsportek's no longer shows sport at all (§5).

Three channels, not equally weighted:

- **Organic search** for "<team> vs <team> live stream". Every URL is team names and a date. This is
  the volume.
- **Domain-hopping for return visits.** Nobody expects a bookmark to survive. footybite.futbol lists
  twelve of its own TLDs, streameast.gold links a numbered family (`nbabite7`, `nflbite7`,
  `soccerstreams7`), ppv.st ships six mirror domains in its Nuxt config, strmfree pushes "Bookmark
  strmfree.link". Mirrors are an anti-block hedge and a place to park a dying domain's traffic.
- **Discord/Telegram**, the only channel that outlives a domain, present on ppv.st, strmfree, thedaddy
  and footybite ("Websites go down. Our links stay live. JOIN THE TELEGRAM").

The *domain* is the asset and the *site* is disposable. `footybite.com` now resolves to a GoDaddy
for-sale lander; `thestreameast.to` 302s the apex to a lead-gen article page that is not a directory.
Both keep the SERP equity and sell the arrival.

## 2. Mechanisms, ranked by how often they are actually used

| # | Mechanism | Where observed | What it mechanically is |
|---|---|---|---|
| 1 | **Click-under popunder on the player surface** | ppv.st, strmfree.pk, thedaddy.li — 3 of 3 tested | A transparent full-viewport catcher (`div#dontfoid`) inside the embed; the click to play opens a new tab. The target is fetched per click from `adexchangeclear.com/script/suurl5.php` (JSON `{url, iurl}`), rotates each click, and the landing URL carries `subID1=…RCPM_POP_US` and `Pub=…`. |
| 2 | **Redirect / underlay / arbitrage** | thestreameast.to, totalsportek.com, vipbox.live | A domain keeps the visit and sells it onward: 302 to a lead-gen page; or `router.parklogic.com` → `cf.georipple.site/middle.html` → `/api/v1/px2` → a shopping affiliate (DHgate); or a source link that hops `streamlink.st` → `klyrme.site`/`xevra.vip` → `posamari.me` before any video exists. |
| 3 | **Display slots** | thedaddy.li (one 909×90 `site-ad--top`), strmfree.pk (5 ad documents home, 12 on a player page), streameast.gold (6 `rapidadexchange.com` calls on an event page) | Reserved boxes and injected divs, tags served from rotating domains (`ndcertainlywhen.com/?tid=…`, `djhwcaxswszkl.website`). |
| 4 | **In-player video ads** | thedaddy, strmfree | Connatix (`capi.connatix.com`) inside the JW Player wrapper. |
| 5 | **Direct CPA / affiliate** | all three popunder targets | Bovada (`?affid=34901`), ACR Poker (`digital.acrpoker.eu/...utm_source=84512`), Jerkmate (`aff_id=262271`), a Steam game install via `gamebassador`, "Ad Blocker Pro" extension promos. |
| 6 | **Pay-per-call** | strmfree.pk only | `dni.ringba.com/v1/nis/hb`, 6 calls on a player page: a tracked phone number that pays per qualified call. |
| 7 | **Paid tiers** | ppv.st, strmfree.pk | ppv.st VIP $6/3 months or $12/year: ad-free, m3u playlist, private CDN, priority requests, extra 24/7 channels, sold via Discord, card or crypto. strmfree VIP $4.49/month: ad-free, dedicated servers, bundled IPTV, PayPal +$1. |
| 8 | **Donations** | none found | No Patreon, Ko-fi or bare PayPal link on any page fetched. "Support us" is folded into VIP. |
| 9 | **Domain arbitrage** | footybite.com, thestreameast.to, totalsportek.com | The domain is a yield instrument: parked for sale, leased to a lead-gen publisher, or fed to an arb click server. |

**None of the six publishes `ads.txt`** (SPA 404 on five, JSON 404 on strmfree). Consistent with what
the traffic shows: hand-placed tags and underlay vendors, not an authorised open auction. Header
bidding is absent from the category.

The structural point: **mechanism 1 belongs to the embed host, not the directory.** `aclib` is served
inside `taifood-blog.asia`, the embed our own feed hands us. On our site the first click already leaves
for an advertiser and pays upstream. We cannot intercept it — the play button is in a cross-origin
frame — so billing a click ourselves means triggering on our own chrome (source pick, retry) or on
load.

## 3. The numbers

| Item | Figure | Basis | Confidence |
|---|---|---|---|
| Popunder, mainstream Tier-1 | **$2.00–$2.50 RCPM** (US Android/iOS) | HilltopAds' published mainstream rate card, 2026 | Medium — vendor card, not our traffic |
| Popunder, blended | $1.00–$4.00 CPM | Adsterra benchmark; ClickAdilla reports $0.98 US average; Kadam $1.50/1000 Tier-1 visits | Low — all three are network marketing |
| Popunder, per **pageview** | **$0.30–$1.20** | Derived: RCPM × click-through (30–60%) minus unfilled | Low — derived, never published |
| Display, sports, Americas | **$1.05 page RPM** | PubMonitor snapshot of Google's own AdSense calculator data, 2026-05-05 | Medium — a floor; premium networks are irrelevant below 50k sessions |
| Sportsbook CPA, US | $25–$35 (FanDuel) to $100–$150 (DraftKings/BetMGM) | OddsMatrix, bettegi; both secondary | Low — books do not publish rates |
| Sportsbook CPA, audited anchor | ≈€270 per CPA-referred depositor | Better Collective 2025 annual report, implied (€22.5M ÷ ~82k CPA NDCs) | Medium — audited, but a company with bargaining power; a new site gets the floor |
| Paid-tier conversion | **0.32% median, 0.48% leading**; 935 per million users | Mather Economics US Subscriber Benchmark Q3 2023 | Medium — news publishers; our vertical is worse |
| Ad-blocking, USA | 33% | eyeo 2026 Ad-Blocking Report | Medium — vendor measurement |

The arithmetic that matters: **a thousand pageviews here is worth about a dollar.** At 50k monthly
event-page views, display plus a click-under is $40–$120 before a single blocker; at 500k it is
$400–$1,200. Anything needing a contract, a review queue or a consent platform costs more attention
than it returns below 100k.

Paid tiers are worse than they look. At ppv.st's $12/year and Mather's leading 0.48%, a thousand users
are worth about $5.76 *a year* — half a month of their ad value, for a product that needs a private CDN
and a Discord channel. strmfree's $4.49 is really an IPTV subscription with ad-free as bait.

Sportsbook money is the only line with a pulse, and it is lumpy and geo-gated: US-only offers, state
eligibility, 21+, and a click → sign-up → KYC → deposit path our global, ad-blocking, drive-by audience
rarely finishes. 500k views realistically yields single-digit depositors.

## 4. What each one costs the user

| Mechanism | User cost | Measured? |
|---|---|---|
| Click-under popunder | A new tab on **every** play click; back-button confusion; mobile tab clutter | Yes — 3 tabs in 3 consecutive clicks on ppv.st (game install, Jerkmate, game install); same on strmfree (Bovada) and thedaddy (ACR Poker) |
| Display | Layout shift if unsized; 20–90 extra requests on the heaviest pages | Yes — thedaddy 49 requests/30 hosts, strmfree 90/24, versus pitsport 58/4 and vipbox 14/2 |
| Video (Connatix) | Pre-roll competing with a stream that already buffers | Partly — endpoints load; the pre-roll was not watched |
| Redirect / underlay | The visitor leaves the page we ranked for | Yes — thestreameast.to apex, totalsportek via parklogic, vipbox source links |
| Arb middle page | A blank white screen while the click server decides; bots get a 204 and nothing | Yes — `cf.georipple.site` returned an empty document, `/px2` 204 (`isBot: true`) |
| Ad-block breakage | thedaddy replaces the page with an "Ad Blocker Pro" extension ad when ad domains are blocked; strmfree still plays ("Direct FHD PLAYING") | Yes, both tested by aborting ad requests |
| Consent | **No CMP on any site fetched** | Yes — zero `consent`/`gdpr`/`cmp` strings in four HTML documents |
| Paid tier | Paywall nag on every page, payment friction, a second product to keep alive | UI only; no purchase made |

Two things it breaks for us:

- **"We host nothing."** Still true — every mechanism is an iframe, a script or a link. But a paywall
  gating *quality* starts to look like a service, and an IPTV bundle (strmfree) definitely is one.
- **Anonymity.** Ads are fingerprinting by construction. `adsco.re` is Adscore, the PopAds team's bot
  detector, rated 3/3 for "excessive use of browser APIs" by Tracker Radar. Turn it on and v1 stops
  being anonymous-by-default unless we say so. A sportsbook CTA also drags in geo-detection.

## 5. What comparable directories actually do

Measured on live pages, 2026-11-19/20.

| Site | Requests / hosts | Ad hosts | Popunder on play | Paid tier | Notes |
|---|---|---|---|---|---|
| `ppv.st/live/nfl-network` | 158 / 10 | 2 (`adexchangeclear.com`, `usrpubtrk.com`), both inside the embed | **Yes**, every click, rotating | $6/3mo, $12/yr | Own chrome is clean: no banner slot, no ads.txt, no CMP. The money is in the embed, which is not theirs either — it is `taifood`'s. |
| `strmfree.pk/player/…` | 90 / 24 | ~14 (`ndcertainlywhen.com` ×12, `wnouncillorswhowish.com`, `adexchangerapid.com`, `usrpubtrk.com`, Ringba, Connatix) | **Yes** → Bovada | $4.49/mo | Heaviest display load of the set; survives blocking |
| `thedaddy.li/stream/stream-32.php` | 49 / 30 | ~20 (`adsco.re` ×3, `xadsmart`, `luugy`, `bvtpk`, `axgbr`, `mrktmtrcs`, `dtscout`, `rapidadexchange`, `profitableratecpmnetwork`, Connatix, Histats, Clarity) | **Yes** → ACR Poker | none | Extension-ad wall when blocked; NakoPay banner |
| `streameast.gold/<match>/<id>` | 21 / 12 | 4 (`rapidadexchange` ×6, `usrpubtrck`, `acscdn`, rotating creative host) | n/a — no player before kick-off | none | Ships fixture pages with no video |
| `vipbox.live/watch/…` | 14 / 2 | **0** | No — sources open a new tab | none | Cleanest page measured, but hands the visitor to `streamlink.st` → `klyrme.site`/`xevra.vip` → `posamari.me`, which 403'd for us |
| `footybite.futbol/…-live-stream/` | 43 / 6 | **0** — GTM/GA only | n/a | none | Literally "FIND LINKS ADS FREE"; routes to nine sibling domains |
| `pitsport.st/` | 58 / 4 | **0** | n/a (own player) | none | Only site here that owns its player and runs nothing |
| `totalsportek.com` | — | arb chain + `usrpubtrk` | n/a | none | Homepage no longer a directory: parklogic → georipple → DHgate |
| `thestreameast.to` | — | lead-gen stack (`locotomato.com` ×26, TrustedForm, LeadID, Adforge) | n/a | none | Apex 302s off-site |
| `footybite.com` | — | GoDaddy lander | n/a | n/a | Parked for sale |

**Could not verify:** `sportsurge.net` (stuck on the Cloudflare interstitial, twice) and
`footybite.to`/`sportsurge.to` (NXDOMAIN). `taifood-blog.asia` now serves a self-signed certificate;
Chrome accepts the frame, curl needs `-k`.

The pattern is a clean split. Sites that **frame** carry ad load on the page. Sites that **link out**
carry almost none and give the revenue to the host they link to. Nobody does both, and nobody frames a
player they own except pitsport, which is also the poorest.

## 6. Our options, costed

Assumptions: 1 pageview = 1 event-page view; two fixed display units; one click-under; global mix
discounted to roughly $1.20 RPM blended. A and B are modelled on that RPM. C and D are modelled
bottom-up, because affiliate and arb money is not a per-impression rate and does not scale linearly.
Ranges, not points.

| | Shape | 50k views/mo | 500k views/mo | What it costs the page | Forecloses later |
|---|---|---|---|---|---|
| **A** | Two display slots only, in the reserved `AdSlot` dimensions | $40–$80 | $400–$800 | ~2 hosts, one script, CLS risk if not reserved; the page stays a page | The click-under, and any ad-free claim |
| **B** | A + one click-under fired from our own chrome (source pick / retry), not the frame | $65–$150 | $650–$1,400 | A new tab on an interaction the user did not read as a purchase | An ads-off promise; sportsbook-only asks |
| **C** | B + one geo-gated sportsbook module on the event page | $150–$400 | $1,500–$4,000 | A third-party widget, state eligibility copy, 21+ and T&Cs | Ad-only positioning; most likely to look like an ad farm |
| **D** | C + homepage arb redirect + video pre-roll | $250–$600 | $2,500–$5,500 | Redirect on entry, pre-roll before a stream that may not load, 30+ hosts | Everything: the homepage stops being ours |

C assumes 1–2% of event views click out, 1–3% of those deposit, $40–$80 per depositor after a
new-affiliate haircut, added to B. D adds a flat $100–$200/month arb yield at 50k (which is what a
parked domain of this size actually clears) plus pre-roll CPM. Confidence low on both; no comparable
publishes a funnel.

The honest read: at 50k, **A and B are the same money** ($40 versus $65) and B costs a tab. At 500k,
B is worth having and C is the first shape that pays attention. D's extra $1,000 buys a homepage
nobody recognises plus a pre-roll on a player that buffers.

## 7. Recommendation

**Ship B, with C behind a flag, and nothing else.**

1. **The click is already being sold without us.** A popunder is not a new imposition; it is the same
   one the visitor would get on the origin, billed to us instead. The argument does not depend on
   volume.
2. **A is not worth the code.** Two slots at $1.05 RPM return under $100/month at 50k while making the
   page an ad page. If we carry weight, carry the part that pays.
3. **B keeps the page honest.** No redirect, no takeover, no pre-roll. The user lands on the event,
   presses play, gets video, with one tab behind them.
4. **C is the only line that grows**, and the only mechanism a visitor might want.
5. **Never D's redirect.** At our size it throws away the thing we built: the event page with the
   player on it.

Concretely: keep both `AdSlot` placements, add one `placeUnderlay()` on our own controls, gate the
sportsbook block on an edge-cached geo lookup. If, after a month at real traffic, revenue per thousand
does not clear about $1.00, pull the display and keep only the underlay.

### Not yet (v2)

- **Video pre-roll / Connatix.** A second player competing with a stream that rebuffers; needs its own
  consent and fill.
- **Ringba pay-per-call.** Needs a tracked number per geo and someone to answer; we have no phone
  product.
- **Arb redirect on entry.** Only pays if we stop being a directory.
- **Our own paid tier.** $12/year at 0.3% is ~$5 per thousand users a year, and gating quality means
  owing uptime. Only alongside something real (playlist, no-popup).
- **Header bidding.** No one here runs `ads.txt`; at 50k the auction overhead exceeds the yield.
- **Donations.** Nothing in the category sustains one; a footer link, not a model.
- **An ad-free promise.** The flip claims "ad-supported", never "ad-free", so a bad RPM month is a credibility problem rather than a broken promise.

## Sources

Fetched 2026-11-19/20: `ppv.st`, `ppv.st/live/nfl-network`, `ppv.st/vip`, `strmfree.pk`,
`strmfree.pk/vip`, `strmfree.pk/player/…`, `thedaddy.li`, `thedaddy.li/stream/stream-32.php`,
`vipbox.live/watch/…`, `streameast.gold`, `streameast.gold/<match>/<id>`, `footybite.futbol`,
`footybite.com`, `thestreameast.to`, `totalsportek.com`, `pitsport.st`,
`taifood-blog.asia/embed/nfl-network`, `adexchangeclear.com/script/suurl5.php`,
`velvetcairns.com/spruce.html`.

Benchmarks: `hilltopads.com/blog/best-cpm-rates-on-popunders-for-publishers-of-hilltopads/`,
`adsterra.com/blog/what-is-a-good-cpm/`, `pubmonitor.com/tools/adsense-calculator`,
`oddsmatrix.com/sports-betting-affiliate-programs/`, `richtactic.com/tactic/sports-betting-affiliate`
(quoting Better Collective's 2025 annual report), `mathereconomics.com` US Subscriber Benchmark Q3 2023,
`eyeo.com/wp-content/uploads/2026/05/eyeo_2026-ad-blocking-report.pdf`,
`duckduckgo.github.io/tracker-radar-wiki/domains/adsco.re.html`.

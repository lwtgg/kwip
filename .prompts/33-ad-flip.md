# Task 33: flip the ads flag on

Rule 22. The click-under (`70d75cc`) and the banner slots (`f42c8a1`) both shipped behind
`runtimeConfig.public.ads`, and both are still off in production. This task turns the flag on with the
house creative, corrects the copy that stops being true, proves the path end to end, and leaves the
flag on.

The house campaign is the proof, so no advertiser is needed. The destination must be an absolute
http(s) URL we are happy to send clicks to: use `https://kwip.fyi/about#ads`, the About page paragraph
this task adds. A banner click and a click-under both land there, in a new tab, through `/go`, with no
referrer.

**Skills read before writing this:** `writing-plans`, `verification-before-completion`,
`kwip-conventions`, `nuxt-seo` (meta), `webapp-testing` (browser runs), `web-perf` (CLS wording).

## Scope

- Fix every claim that the flag makes false (section 1). Nothing else in app copy changes.
- Configure the house campaign for `event-banner` only (section 2).
- Preview, then production, in the order given (section 3). Roll back per section 4.
- No new dependency, no ad network, no consent surface, no analytics, no deploy of tracks.
- Do not edit `DECISIONS.md` (orchestrator only); section 1 says what the orchestrator must change.

## What is already true, so do not re-litigate

- The slot renders only when `ads` is on **and** the placement has a creative; otherwise nothing
  renders and the page is today's page.
- Fixed dimensions come from `theme.css` (`--banner-leaderboard-*`, `--banner-mobile-*`) and are in
  the SSR HTML, so the ad contributes zero CLS.
- `ads=1` is appended to the edge-cache key only when the flag is on (`edge-cache-handler.ts:34`) and
  is stripped from the render path (`normalizeEdgeRenderPath`). Old-mode entries are never served
  under a new mode.
- The click-under is capped per session in `sessionStorage`, skips `always_live === 1`, and does not
  fire on an already-selected chip.
- A banner click never touches the click-under cap. `/go` is `no-store` and sends
  `referrer-policy: no-referrer`.

## 1. Copy

Every place below is either false the moment the flag is on, or is the honest place to say what the
ads are. Replacements are the whole sentence; sentence case, no exclamation marks, no "streaming",
no counts, no tracking promise. `app/pages/index.vue` and `app/pages/about.vue` are the only two
app files in scope; stage only these lines.

### Must change — meta (highest priority, what search sees)

`app/pages/index.vue:177-179`

Old:

```ts
const pageDescription = computed(
  () => `Browse live sports events, 24/7 channels, and upcoming fixtures in the ${siteName} live event directory.`,
)
```

New:

```ts
const pageDescription = computed(
  () => `Browse live sports events, 24/7 channels, and upcoming fixtures in the ${siteName} live event directory, kept running by a few of our own ads.`,
)
```

`ogDescription` binds to the same computed, so it follows. 139 characters, and it survives being read
on a day the flag is off without embarrassment.

### Must change — the honest disclosure

`app/pages/about.vue`, insert after line 22, inside the same `<section>`:

```html
    <p id="ads" class="opacity-80">
      The ads are ours and few: one banner below the player and one advertiser tab on the first
      source you pick on a scheduled event. 24/7 channels do not open one. They are plain links and
      images, so an ad blocker takes nothing from playback, and there is no account or consent wall.
    </p>
```

`id="ads"` is the destination anchor. It ships in the first production version, with the flag still
off, so it exists before any click can reach it.

### Must change — framing docs

`AGENTS.md:3`

Old: `... Canonical host \`kwip.fyi\`, mirror \`kwip.lol\`, v1 ad-free and anonymous.`

New: `... Canonical host \`kwip.fyi\`, mirror \`kwip.lol\`. The ads are ours and few, and v1 needs no account.`

("anonymous" alone is no longer accurate: the embed host's `aclib` and our own `/go` hop are
third-party-visible. "needs no account" is the claim we can defend.)

`.prompts/00-framing.md:5`, replace the tail `no backend, no database, no auth, no ads in v1.` with:

`no backend, no database, no auth. The only ads are ours and few: one banner below the player, one advertiser tab on the first source you pick.`

`.prompts/00-framing.md:20`, replace the row `| member area, ad-free tier | VIP |` with:

`| member area, paid ad-free tier | VIP |`

("paid ad-free tier" is a v2 name, not a claim about v1.)

### Must change — research and roadmap

`docs/money-research.md:11-15`, replace the whole paragraph with:

```
One finding reframes the brief, so it goes first: **v1 was never ad-free in practice.** Three of the
three embed-fed sites tested fire a popunder when the visitor clicks the player, and we frame one of
those same embeds. Our page already carries a third-party ad library (`aclib`) and hands a new tab to
whoever wins the auction. Since the flip the page also carries our own few ads, one banner and one
click-under, while the embed's popunder still fires underneath and is not ours.
```

`docs/money-research.md:192`, replace with:

`- **An ad-free promise.** The flip claims "ad-supported", never "ad-free", so a bad RPM month is a credibility problem rather than a broken promise.`

`ROADMAP.md:24-27`, replace the four bullets with:

```
- Click-under: shipped in `70d75cc`, live in production. `/go/<placement>` 302s with no referrer. The destination is the house campaign until an advertiser exists, then one env change.
- Banner slots: shipped in `f42c8a1`, live in production in `event-banner` only. Fixed dimensions, no reflow. Creatives come from `/banners/<file>` over the `BANNER_ASSETS` R2 binding, so a sold banner is an upload plus config, not a deploy.
- Copy: shipped with the flip. In-app copy never used "ad-free", so the work was the homepage meta description, the About page, `AGENTS.md`, `.prompts/00-framing.md` and this doc. All now say ad-supported.
- The last step is a sold creative. The house campaign proves the path; replacing it is an R2 upload and a config change, with no code deploy.
```

### Orchestrator only, flag in the reply

`DECISIONS.md:10` (rule 6) still reads "No ads in v1". Rule 22 supersedes it, so add `Superseded by 22.` to the end of rule 6. Rule 22 itself stays as written. Do not edit either.

### Deliberately unchanged

- `.prompts/01-scaffold.md:26` (`No analytics, no auth, no ads`) — a record of task 1; leave it.
- `.prompts/30-click-under.md:5` (`So v1 is not ad-free`) — already true at the flip; leave it.
- `app/pages/live/[...uri].vue:490-494`, `app/pages/vods/[slug].vue:215-219`, `app/pages/vods/index.vue:93-95`, `app/pages/about.vue:6-9`, `app/pages/mirrors.vue:58-60` — none claims ad-free, so none changes.
- `docs/money-research.md:148-149` — the cost table's "any ad-free claim" and "ads-off promise" are still accurate trade-off notes, not claims about the site.
- The `Advertisement` label in `AdSlot.vue` and the `Opens an advertiser in a new tab` accessible names are the in-page disclosure and already ship.

## 2. Config

Exact values. Set as Worker vars on the version, not baked into the build, so a flag change is a
version upload and not a rebuild.

```
NUXT_PUBLIC_ADS=true
NUXT_AD_DESTINATION=https://kwip.fyi/about#ads
NUXT_PUBLIC_BANNER_CREATIVES={"event-banner":{"image":"/banners/house.webp","alt":"kwip is ad-supported: how our ads work","destination":"https://kwip.fyi/about#ads"}}
```

Notes that make those values the only correct ones:

- `adDestination` is private runtime config (`NUXT_AD_DESTINATION`), so it never enters the page
  payload. It is what `/go/source` and `/go/play` 302 to.
- The creative object **replaces** the default `bannerCreatives` wholesale, so `home-banner` and
  `vods-banner` are simply absent. Absent is the same as empty; do not add empty objects.
- `alt` doubles as the link's `aria-label`, so it reads as a link, not as image caption.
- Destination is the canonical host even when the click starts on `kwip.lol`; mirrors are never
  linked internally (rule 13).
- The creative key is `JSON.stringify([placement, image, alt, destination])`, and `/go` returns `410`
  if it does not match the configured creative. Do not edit the creative while cached pages exist
  without expecting up to 15 minutes of `410`s on those clicks.

**Placements left empty in v1:** `home-banner` and `vods-banner`.

Why: the event page is the unit of value and its slot already sits below the player, where rule 22
allows one. The house campaign is one proof, not an inventory. Filling the homepage slot would put an
ad box above the hero on the page strangers hit first, and the `/vods` slot would put one above an
archive nobody arrives at directly. Both are already in the markup, so filling either later is the
same config line, no code.

Do not change: `nuxt.config.ts` defaults stay `ads: false` and the three empty creatives, so a Worker
with no vars renders today's page. `wrangler.toml` `[vars]` stays without ads keys for the same
reason; the values above live on versions.

## 3. Preview-first rollout

There is one known shape problem, resolved here: the canonical-host middleware 301s any host that is
not `kwip.fyi`, so a `*.workers.dev` version URL is not previewable. Use `wrangler dev --remote`
against `localhost`, which the middleware exempts. Local requests carry no `cf-ray`, so the edge cache
does not run in preview; the cache assertions therefore happen on production in step 6, by flipping
the flag off and on again.

1. **Record the rollback point.** `pnpm exec wrangler versions list` — note the current production
   version id. Download the house creative for the preview bucket (it is only in production):
   `pnpm exec wrangler r2 object get kwip-banners-prod/house.webp --file /tmp/kwip-house.webp`
   then `pnpm exec wrangler r2 object put kwip-banners-preview/house.webp --file /tmp/kwip-house.webp --content-type image/webp`.
   Without this the preview 404s the image and proves nothing.
2. **Land the copy and the config plumbing** in the branch. `pnpm build`, then `pnpm test`.
3. **Preview, flag on.** Build once, then start the Worker; never build while it runs:
   `pnpm exec wrangler dev .output/server/index.mjs --assets .output/public --remote --var NUXT_PUBLIC_ADS:true --var NUXT_AD_DESTINATION:'https://kwip.fyi/about#ads' --var 'NUXT_PUBLIC_BANNER_CREATIVES={"event-banner":{"image":"/banners/house.webp","alt":"kwip is ad-supported: how our ads work","destination":"https://kwip.fyi/about#ads"}}'`
4. **Check the creative before anything else.** It is a real WebP, but it is 1200×523 — an OG image —
   and `object-cover` in a 970×90 desktop slot keeps only a middle band. Confirm at 390 px and 1280 px
   that no text is cropped. Expect it to be; a house creative sized for the slot (roughly 970×90 with
   bleed, subject centred, and a separate 320×100 variant is not possible from one file) is part of
   this task if the crop is unreadable. The served MIME always follows the extension by design
   (`banner-image.ts`), so keep `.webp` honest with the bytes.
5. **Browser suites below, both flag states, at 390 px and 1280 px.** Off state is the same build with
   no vars. Both must pass.
6. **Production, in this order.**
   a. Ship the code with the flag still off: `pnpm exec wrangler versions upload`, then
      `pnpm exec wrangler versions deploy <id>@100%`. Check `/about#ads` exists and the meta
      description reads correctly with no ad on the page.
   b. Warm an event page with the flag on is not possible yet, so: upload the ads-on version
      (step 2 values), deploy `@100%`, fetch one event page twice and confirm the banner is in the
      body both times and the second response is `x-kwip-cache: hit`.
   c. **Cache-key proof, direction one.** Upload a version with `NUXT_PUBLIC_ADS=false` (same code),
      deploy `@100%`, immediately fetch the same path: `x-kwip-cache: miss`, no `Advertisement` in the
      body, `"ads":false` in the payload. A served hit here would mean the key does not carry the
      mode.
   d. **Direction two.** Upload the ads-on version again, deploy `@100%`, immediately fetch: `miss`
      and a banner present. Because `ads=1` is in the key, neither direction can serve the other
      mode's entry.
   e. Leave the flag on. `adDestination` and the creative stay.
7. **Production verification list** — all of it, on `https://kwip.fyi`, after step 6e:
   - `curl -s https://kwip.fyi/live/<uri> | grep -c 'Advertisement'` is `1`; the same page with
     `?filter=live` still renders one.
   - `curl -s https://kwip.fyi/ | grep -o 'ads=1'` finds nothing (the key param must not leak into
     URLs), and `rel="canonical"` / `og:url` are unchanged `https://kwip.fyi/...`.
   - `/go/event-banner` with the current creative key (compute it with
     `node -e 'console.log(encodeURIComponent(JSON.stringify(["event-banner","/banners/house.webp","kwip is ad-supported: how our ads work","https://kwip.fyi/about#ads"])))'`)
     302s to `https://kwip.fyi/about#ads` with `referrer-policy: no-referrer` and `cache-control: no-store`.
     `/go/source` 302s to the same destination. `/go/play` too. `/go/nonsense` 302s to
     `https://kwip.fyi/`.
   - In a fresh session, first source click opens exactly one tab; second click opens none; a first
     click on a different event in the same session opens none. The chip's accessible name drops
     `Opens an advertiser in a new tab` once the cap is spent.
   - A 24/7 channel (`always_live === 1`) opens no tab on play or on a chip, and its aria-label has no
     advertiser clause.
   - With ad requests blocked, the player still loads and the first click still opens the banner-free
     page; `/banners/house.webp` still `200`s (it is first-party).
   - CLS on `/`, `/vods` and one event page is the same number as with the flag off, measured with a
     `PerformanceObserver` layout-shift entry at both widths and reported.
   - The sitemap still validates and its entries now carry `ads=1` too; this is harmless but expect
     the extra key namespace.

## 4. Rollback

Flipping back is one version upload with `NUXT_PUBLIC_ADS=false` and `versions deploy @100%`.
`NUXT_AD_DESTINATION` and the creative can stay; both are inert with the flag off. No rebuild, about a
minute, and the reverse is the same minute.

What it costs, exactly:

- **Copy.** The meta description and the About paragraph keep claiming ads that no longer render.
  Acceptable for an hour; if the flag stays off longer than a day, revert section 1 in one commit.
- **Cached `ads=1` entries.** They are not read again, because the new key has no `ads` param, so no
  visitor is served an ad page after the flip. They linger until their own deadline, capped at 900 s
  and usually shorter at the next kickoff, then are evicted. They cost cache space, not correctness.
- **Open tabs.** A page rendered before the flip has `ads:true` in its payload and keeps firing
  `/go/source` and banner links. With the flag off, `/go/<banner>` (and `/go/source`) 302 to
  `https://kwip.fyi/`, so those clicks land on the homepage, not the About page. Bounded by tab
  lifetime or a reload. This is the only user-visible residue and it is not a homepage *entry*
  redirect, so rule 22 holds.
- **A stale creative key** stops mattering: flag off ignores the key, so no `410`s appear.
- **Cleanup.** Nothing. `house.webp` stays in both buckets and the config stays, so the re-flip is
  the same single command.

`pnpm exec wrangler rollback <version-id>` also works and reverts vars and copy together, but it
discards any unrelated work shipped since; prefer the env flip unless the rollback point is the
immediately previous version.

## 5. Gates

1. `pnpm test` — green, including `tests/banner.test.ts` and `tests/clickUnder.test.ts` unchanged. No
   new unit test is required: the flip is config, and the existing tests already pin the handlers.
2. `pnpm build` — green.
3. `NITRO_PRESET=node-server pnpm build` — green (rule 7 escape hatch).
4. `pnpm exec wrangler deploy --dry-run` — green.
5. Browser suites, manually via agent-browser/`webapp-testing` (there is no committed Playwright
   dependency and none is added), at 390 px and 1280 px, **in both flag states**, all of:
   - flag off: no `Advertisement` node, no `data-ad-format`, no advertiser clause in any aria-label,
     the serialized public config still says `"ads":false`, and the page otherwise identical to `main`
     apart from the meta description and About paragraph;
   - flag on: exactly one creative per page and per back navigation, keyboard reachable with a visible
     focus ring, label announced, image failure degrades to the labelled fixed box;
   - click-under: one tab then none, 24/7 exempt, cap survives a reload, blocked ads do not stop
     playback;
   - CLS measured and equal across states.
6. Report in the reply: the CLS numbers, the third-party request count with the flag on versus off,
   the creative crop outcome at both widths, and the evidence for each production verification line.
   No "should", no assertion without an output.

## Out of scope

An ad network or script, `home-banner`/`vods-banner` fill, the rail format, geo or sportsbook, a
consent banner, an ad-free mention anywhere, `ads.txt`, and any change to the click-under or slot
components beyond the two copy files. Leave `DECISIONS.md` to the orchestrator.

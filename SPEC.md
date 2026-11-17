# Spec

Brand name comes from `runtimeConfig.public.siteName` (`NUXT_PUBLIC_SITE_NAME`); never hardcode it.

## Routes

| Route | Purpose |
|---|---|
| `/` | Home: live rail, category rails, category jump bar |
| `/c/{category}` | One category, all its streams, filter for live/upcoming |
| `/live/{uri_name}` | Player page |
| `/vods` | Archive index |
| `/vods/{slug}` | VOD detail + player |
| `/mirrors` | Static page listing mirror domains from `/api/domains` |
| `/about` | Short neutral blurb, one paragraph, plus the iframe sentence |

## Home

- Sticky header: brand, category jump bar (horizontal scroll on mobile), theme toggle, mirror icon link
- Hero: the single most-watched live stream — poster, title, category, viewer count, play button
- "Live now" rail: horizontal, ordered by `viewers` desc, only `always_live === 0` and `ends_at > now`
- "24/7" rail: `always_live === 1`
- Per-category rails, category title linking to `/c/{category}`
- Upcoming block: `starts_at > now`, showing a relative countdown
- `AdSlot` between the hero and the first rail (reserved, empty in v1)

## StreamCard

Props only, no fetching. Poster (blurhash placeholder → image crossfade), live pill with pulse for live items, viewer count formatted `1.7k`, category chip, title clamped to 2 lines. Whole card is one link. Rendered as a `skeleton` variant while data streams or when the image is absent.

## Player page

- Breadcrumb, title, `Change source` select (from `sources[]` plus `substreams[]`), viewer count, category
- 16:9 iframe, `allow="autoplay; fullscreen; picture-in-picture"`, `allowfullscreen`
- Skeleton over the frame until `load`; on `error` or a 12s timeout, auto-advance to the next source; when the chain is exhausted, show a "no working source" block with a retry button
- Below the frame: `AdSlot` (reserved 970×90 / 320×100), then related streams in the same category

## VOD detail

Same shell, `source` from `/vods/{slug}`. If `type === "playlist"`, use `<video controls playsinline>` with the URL so the browser's native HLS handles it (Safari) and show a "use Safari or an HLS-capable browser" note otherwise.

## States

Every data route renders: skeleton (streaming), empty (no items), error (feed failed, with retry), stale (data older than 5 min → thin banner). No route may render bare or throw.

## Global

- `/sitemap.xml` from the current `/streams` + `/vods`, `/robots.txt` allowing all
- Per-page `<title>`, meta description, `og:*`, canonical; `SportsEvent` JSON-LD on stream pages with `startDate`, `endDate`, `location`, `competitor`
- Dark default, light must pass contrast; respect `prefers-reduced-motion` (no pulse, no crossfade)
- Keyboard: skip link, visible focus, player select reachable, iframe labelled
- 320 / 768 / 1280 breakpoints; rails become vertical stacks under 768
- Empty `AdSlot` reserves exact space, zero layout shift when filled later

# Task 17a — P2: per-event OG images

`DESIGN.md` P2 item 13. Static posters only; no runtime rendering, no dependency.

The live and VOD detail pages already set `ogImage` to whatever the feed gives, which is relative for fixtures and absolute for the live CDN, with no `og:image:alt`, no dimensions, and no card type. Every other page has none. Make it uniform: absolute canonical URLs, an alt, a card type, and a site default.

`public/og-default.jpg` already exists — 1200×523, the logo, generated from `logo@2x.png`. Use it as given.

## Behaviour

- New `app/composables/useOgImage.ts`: `useOgImage(source, alt)` where `source` is a `MaybeRefOrGetter<string | undefined>`.
  - A rooted path (`/fixtures/poster-1.jpg`) resolves against `https://${canonicalHost}`.
  - An `https:` URL is passed through untouched.
  - Empty, missing, or non-http(s) values fall back to `/og-default.jpg`.
  - Always emits `ogImageAlt` (the passed alt) and `twitterCard: 'summary_large_image'`.
  - Emits `ogImageWidth`/`ogImageHeight` **only** for the default (1200/523); when a real poster is used, clears them so the site-wide defaults do not leak.
- `app/app.vue`: site-level defaults — the default image, `ogImageAlt` with the site name, and `twitterCard`. Every page inherits them.
- `app/pages/live/[...uri].vue` and `app/pages/vods/[slug].vue`: replace the bare `ogImage` with `useOgImage(() => detail.value?.poster, event name)`. The alt is the event name, not the category.
- Home, `app/pages/c/[category].vue`, `app/pages/vods/index.vue`, and `app/pages/about.vue`: set an alt that names the page (no poster).

## Rules

- No new dependency, no new route, no copy on the page itself.
- Rule 13 still holds: `og:url` and canonical stay canonical-host and absolute.
- Exactly one `og:image` per page — no stacked duplicates.
- Do not touch `app/components/**`, `app/composables/useFeed.ts`, `useDensity.ts`, `useTheme.ts`, `app/utils/**`, `server/**`, the logo, or the favicons.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, and in the built SSR HTML: `/` carries the absolute default with width/height, a live event page carries its absolute poster with alt and no width/height, a fixture page with a rooted poster carries the canonical-host-absolute URL, and every inspected page has one `og:image`, a `twitter:card`, and an absolute `og:url`. Reply with files, outcomes, and what you checked.

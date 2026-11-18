# Task 16a — P2: blurhash posters behind missing or loading images

`DESIGN.md` P2 item 11. Rule 9 is signed off for this task: **no new package**. Two new files, both ours, both small. The decoder is the only borrowed algorithm and it gets an attribution comment.

The feed ships `blurhash` on most items. Today we ignore it and show a gradient. Decode it into a tiny raster and use that as the poster fallback, and as the layer behind a poster while it loads.

## Behaviour

- New `app/utils/blurhash.ts`: a pure `decodeBlurhash(hash: string, width: number, height: number): Uint8ClampedArray | null` implementing the standard blurhash decode (base-83 header, DCT over the AC components, sRGB re-encode). `null` on anything malformed — short string, bad characters, absurd component counts. No DOM, no globals, no caching in this file. Keep it lean; a port of the reference decoder's core is the expected shape, with a `// Blurhash algorithm — MIT, from woltapp/blurhash` comment.
- New `app/composables/usePosterBlur.ts`: `blurBackground(hash)` returns a `ref<string | undefined>` of a `url(data:image/png;base64,…)` style value, filled after mount (never during SSR), decoded at 32 px wide and 18 px tall, drawn on an offscreen canvas. Cache by hash in a module-level `Map` capped at 200 entries, evicting oldest first. Skip the work when the hash is empty or already cached, and schedule it with `requestIdleCallback` when available, `setTimeout(0)` otherwise.
- `app/components/PosterFallback.vue`: new optional `blurhash?: string` prop. When a decoded background exists, use it (with a short CSS blur and a slight scale so the upscale is smooth) as the base layer instead of the gradient; the monogram and the dark scrim stay on top, and the gradient stays as the immediate under-layer so there is no flash. No layout change.
- `app/components/StreamCard.vue` and the home hero: while the real poster is loading (`imgLoaded === false`) and a blurhash exists, show the decoded layer under the image, `aria-hidden="true"`. Pass `:blurhash` to `PosterFallback` in both files and in `app/pages/index.vue`'s next-up strip.
- Never in the player: the iframe is the picture there.

## Rules

- No new dependency, no new route, no copy. Do not touch `app/composables/useFeed.ts`, `usePlayerSources.ts`, `usePlayerShield.ts`, `server/**`, the player page, or the logo/favicon.
- Everything is decorative: `aria-hidden`, and the existing `alt`/monogram semantics must not change.
- An invalid or unknown hash must degrade to exactly today's gradient, with no console output.
- Decode for every tile, including 24/7; keep it idle-scheduled so it never blocks a paint.
- Respect `prefers-reduced-motion` for any transition you add.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, on `/` the cards with a `blurhash` show a decoded wash instead of a flat gradient, a card with a poster shows the wash under it while loading, a garbage hash still shows the gradient, no extra network requests appear in the console, and the console is clean. Report any measured decode cost. Reply with files, outcomes, and what you checked.

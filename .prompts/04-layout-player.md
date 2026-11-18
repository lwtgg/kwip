# Task 04 — layout, cards, player (Agent A)

Stop condition: `pnpm build` exits 0, and each of `/`, `/c/basketball`, `/live/football/ars-eve` renders real content from the fixtures in a dev server. Nothing else counts as done.

Read `SPEC.md` (sections Home, StreamCard, Player page, States, Global) and `DECISIONS.md` 1-15. Your glob is `CONTRACT.md` Agent A. Do not edit `useFeed.ts`, `usePlayerSources.ts`, `server/**` or `nuxt.config.ts`.

Feed access is `useStreams()`, `useStream(uri)`, `usePlayerSources(detail)` — all already written. Components take props and never fetch.

## Do

1. `app/composables/useTheme.ts` — `dark | light` in a cookie, `classList` on `<html>`, no flash: read the cookie server-side in `app.vue`-adjacent setup or a plugin, default dark. Respect `prefers-color-scheme` only when no cookie.
2. `app/layouts/default.vue` — sticky header with brand from `runtimeConfig.public.siteName`, category jump bar (horizontal scroll, `overflow-x-auto`, keyboard reachable), theme toggle, mirror icon link to `/mirrors`. Footer with `/about` and `/mirrors`. Skip link target lives in `app.vue` already.
3. `app/components/StateBlock.vue` — variants `skeleton | empty | error | stale`, props `rows` and `message`, emits `retry`. Reduced motion respected.
4. `app/components/StreamCard.vue` — exactly the SPEC props-only contract. Blurhash placeholder is a flat `colors[0]` block behind the image with a crossfade on `load` (no blurhash decoder dependency); variant `skeleton`; live pill pulses unless reduced motion; viewers formatted `1.7k`; title clamped to 2 lines; whole card one `<NuxtLink>`.
5. `app/components/Rail.vue` — horizontal scroll-snap row of cards, title links to `/c/{category}`, becomes a vertical stack under 768px.
6. `app/components/PlayerFrame.vue` — 16:9 iframe, `allow="autoplay; fullscreen; picture-in-picture"`, `allowfullscreen`, `title`, skeleton overlay until `load`, 12s timeout, `error` emit. `SourceSelect.vue` — labelled `select` over the source chain, first option disabled.
7. `app/pages/index.vue` — hero from the most-watched live stream, `AdSlot` leaderboard, live rail, 24/7 rail, category rails, upcoming block with relative countdown. All four states wired.
8. `app/pages/c/[category].vue` — one category, live/upcoming filter as a query string, all four states.
9. `app/pages/live/[...uri].vue` — catch-all so `uri_name` slashes survive. Breadcrumb, title, source select, viewer count, category, the frame chain with auto-advance to the next source on error/timeout, and the exhausted-chain block with retry. Related streams below, then the `AdSlot`.
10. Per-route `<title>`, meta description, `og:*` via `useSeoMeta`. `SportsEvent` JSON-LD on the player page.

## Don't

- No new dependency. Blurhash stays a flat colour block.
- No feed fetch in a component, no `useState` for feed data.
- No `app/pages/vods/**`, `/mirrors`, `/about` — those are Agent B.
- Changes to `adSlot` sizes only from SPEC.

First action is a tool call. Reply with changed files and the build exit code, plus which routes you curled and what they rendered.

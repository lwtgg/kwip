# Task 01 — scaffold (Agent B, then hand off)

Read `README.md`, `SPEC.md`, `DECISIONS.md`, `API.md`, `INFRA.md`, `CONTRACT.md`.

You are setting up an empty Nuxt 3 repo. Nothing exists yet.

## Do

1. `pnpm dlx nuxi init . --packageManager pnpm --gitInit false`, then set `ssr: true`, `devtools: false`, and the Cloudflare preset per `INFRA.md`.
2. Install and configure Tailwind v4 with `app/assets/css/theme.css`: dark base, surface/border/accent/muted tokens, `--radius`, focus ring. No component library.
3. `app/composables/useFeed.ts` — typed fetch helpers for every endpoint in `API.md`, `useAsyncData` on the server, 60s cache key, `success: false` mapped to a thrown error, primary base with fallback to the mirror base on network error only.
4. `app/composables/usePlayerSources.ts` — pure function turning a stream detail into an ordered `{ label, url }[]`, dropping empty `data`, `substreams` appended after `sources`.
5. `app/components/AdSlot.vue` — props `format` (`leaderboard` | `mobile` | `rail`), reserved dimensions from `SPEC.md`, `aria-hidden`, renders an empty labelled box.
6. `app/app.vue` with `<NuxtLayout><NuxtPage />`, `definePageMeta`-free, plus skip link and `<html class="dark">` default.
7. `server/routes/api/domains.get.ts` returning the mirror list from a `public/domains.json`.
8. Canonical-host enforcement from `DECISIONS.md` rule 13: a Nitro server middleware that 301s any request whose host is not `config.public.canonicalHost` to the canonical absolute URL (path + query intact), plus `app.vue`/`useHead` defaults emitting `link[rel=canonical]` and `og:url` from the current path against `canonicalHost`. No literal hostnames anywhere.
9. `.env.example` with `NUXT_PUBLIC_SITE_NAME=kwip`, `NUXT_PUBLIC_CANONICAL_HOST=kwip.fyi`, and `NUXT_PUBLIC_FEED_BASE`.
10. `pnpm build` passing.

## Don't

- No components beyond `AdSlot`
- No pages with content
- No analytics, no auth, no ads
- No new dependency without listing it in your reply

Reply with changed files, the dependency list, and the build output tail.

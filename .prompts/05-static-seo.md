# Task 05 — static pages and SEO routes (Agent B)

Stop condition: `pnpm build` exits 0, and `curl` of `/mirrors`, `/about`, `/sitemap.xml`, `/robots.txt` on the dev server returns the intended output. Nothing else counts as done.

Read `SPEC.md` (Routes, Global) and `DECISIONS.md` 1-15. Your glob is `CONTRACT.md` Agent B. Do not edit `app/components/**`, `app/layouts/**`, `app/pages/index.vue` or `app/composables/**`.

None of this needs a decision: sitemap entries come from the feed already in `useFeed.ts`, the mirror list is the `public/domains.json` already served by `/api/domains`, and the two pages are copy plus lists.

## Do

1. `app/pages/mirrors.vue` — fetch `/api/domains` with `$fetch`, list the canonical host as current and each mirror as an absolute external link, one neutral sentence about them being the same site.
2. `app/pages/about.vue` — one short paragraph per SPEC, neutral wording per `DECISIONS.md` 10, plus the single iframe sentence. No legality claims beyond that.
3. `server/routes/sitemap.xml.ts` — every stream `uri_name` and VOD slug from the feed, absolute against `runtimeConfig.public.canonicalHost`, `<lastmod>` from `starts_at`/`added`. `content-type: application/xml`. Fail soft: if the feed throws, still return the static routes.
4. `public/robots.txt` — allow all, `Sitemap:` line absolute against the canonical host.
5. `server/utils/jsonld.ts` — `sportsEventLd(stream)` returning the `SportsEvent` object SPEC requires (`startDate`, `endDate`, `location`, `competitor`). Agent A imports it; keep the signature stable.
6. `useSeoMeta` on both pages, descriptions distinct.

## Don't

- No new dependency.
- No hardcoded hostname; canonical host from config.
- No edits outside your glob, including `useFeed.ts`.

First action is a tool call. Reply with changed files, the build exit code and the curl output for the four paths.

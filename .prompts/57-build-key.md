# Brief — task 57, the HTML cache key must know the build

Defect recorded in `ROADMAP.md` under "Defect found 2026-11-24 — a deploy leaves cached HTML pointing at dead
assets". Reproduce it first, then fix it.

The edge page cache key (`server/utils/edge-cache.ts:11`, filled by `server/utils/edge-cache-handler.ts:47`)
carries origin, host, render query and the feed generation — but not the build. After a deploy, HTML cached by
the previous build still names the previous build's hashed `/_nuxt/entry.*.css`; that file no longer exists, and
until the entry expires (up to 15 minutes) or the generation turns, the page renders unstyled: cards collapse,
the theme is gone. Reproduced twice today on `kwip.fyi`.

## Fix

Put the build identity in the key. Nitro already exposes `useRuntimeConfig(event).app.buildId`. Read it once in
`lookupEdgePage`, pass it to `edgeCacheKey` as its own parameter alongside `generation`, `host` and the render
query, and set it in the key as a distinct search parameter. An absent build id must not collide with a real one
and must not throw. Old entries become unreachable and age out on their own; the TTL rules do not change.

## Proof

**Unit:** two build ids produce different keys; the same build id and URL produce equal keys; `host` and
`generation` still separate keys; the parameter is normalised like the existing ones.

**Behavioural**, and this is the part that matters. Warm the edge cache through `wrangler dev` (it emulates
`caches.default`), then make a real second build with a different build id and a different `entry.*` hash,
request the same URL again, and assert three things:

1. `x-kwip-cache` is `miss`;
2. the served HTML names an `entry.*.css` that exists in `.output/public/_nuxt`;
3. a third request, now cached under the new build, is a `hit` serving that same live hash.

Then mutate the fix back out (drop the build from the key), repeat, and show it failing — `hit` with a dead hash.
Record both runs with the commands and the observed headers.

`wrangler dev` must not run while a build writes `.output/`: build, start, request, stop, rebuild, start,
request, stop.

## Gate

If `.env` exists in the worktree it must say `NUXT_PUBLIC_FEED_BASE=/api/feed`; do not restore the provider URL.
Then the full suite, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild,
`pnpm exec wrangler deploy --dry-run`, and all six browser suites at both widths, plus the mutation proof above.
Commit, don't deploy, don't touch `.prompts` or `DECISIONS.md`. Update the queued defect in `ROADMAP.md` to say
it is fixed, or leave it and say why not.

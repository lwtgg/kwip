# kwip

A live sports event directory: a schedule grouped by category, each event pointing at the sources that carry it. A source is either an outbound `link` or an `iframe` embed; this repo hosts no media.

Stack: Nuxt 3 (SSR on), Tailwind v4, deployed to Cloudflare Workers.

Build target is the committed fixture feed in `public/fixtures/`. A live provider feed is an adapter, selected with `NUXT_PUBLIC_FEED_BASE` (and `NUXT_PUBLIC_FEED_MIRROR_BASE` for the fallback).

Read `SPEC.md`, `DECISIONS.md` and `API.md` before changing anything. Facts about the outside world live in `API.md` — take them as given and don't re-derive them.

- `SPEC.md` — what exists, page by page
- `DECISIONS.md` — settled choices, numbered, do not relitigate
- `API.md` — the external JSON feed we consume
- `CONTRACT.md` — which files each agent owns
- `INFRA.md` — hosting, domains, deploy
- `.prompts/` — the brief for the current task

## Checks

```sh
pnpm test   # node:test, no extra dependency
pnpm build
```

## Deploy

Cloudflare Workers (see `INFRA.md`). Both zones (`kwip.fyi`, `kwip.lol`) must be **Active** in Cloudflare before the first deploy, or the custom-domain routes fail.

```sh
pnpm build             # Nitro cloudflare_module → .output/
pnpm wrangler login    # once per machine
pnpm deploy            # wrangler deploy; pass flags after --, e.g. pnpm deploy -- --dry-run
pnpm preview           # local wrangler dev against .output/
```

Rollback: `pnpm wrangler rollback <version-id>`.

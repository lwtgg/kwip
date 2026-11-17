# Infrastructure

## Target

Cloudflare Workers via Nitro `cloudflare_module` preset. Free plan until 100k requests/day, then Workers Paid ($5/mo, 10M requests).

Escape hatch kept working: `nitro.preset = "node-server"` on a Hetzner CX22 behind Cloudflare proxy. Nothing host-specific outside `nuxt.config.ts` and `wrangler.toml`.

## Requirements

- `wrangler.toml` with `compatibility_date`, no secrets committed
- `NUXT_PUBLIC_SITE_NAME`, `NUXT_PUBLIC_FEED_BASE` from env; no literal feed URL in components
- Cache Rules: HTML 30s, `stale-while-revalidate=300`, bypass on `/api/*` and query strings except `?page=`
- `/api/domains` returns our mirror list, served from a static JSON in the Worker
- `pnpm build` must pass with both presets

## Domains

Primary `*.com` for trust and SEO; mirrors on `*.net`, `*.to`, `*.cx`, `*.st` across different registries. All at Porkbun, nameservers delegated to Cloudflare, TTL 300, all routes on the same Worker deployment.

## Deploy

`wrangler deploy` from CI or locally; preview per branch. Rollback is a previous version id, not a rebuild.

## Not yet

DDoS-Guard, image proxy, own player, R2.

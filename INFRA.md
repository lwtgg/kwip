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

Registered at Porkbun. Nameservers delegated to Cloudflare; both zones on the Free plan, SSL/TLS **Full (strict)**, zone apex and `www` served by the same Worker deployment. Registrant email and Cloudflare account are on the same dedicated mailbox; 2FA on both.

| Role | Domain | Registered | Renewal | Auto-renew |
|---|---|---|---|---|
| Canonical | `kwip.fyi` | 2026-11-17 | $5.66 flat | on |
| Mirror | `kwip.lol` | 2026-11-17 | $26.26 | off |

Mirrors never diverge in content; see rule 13 in `DECISIONS.md` for the canonical/301 enforcement. Adding a mirror means: register, delegate NS to Cloudflare, add a Worker custom domain, add its host to the mirror list `GET /api/domains` returns. No `.com` until the brand earns one.

## Deploy

`wrangler deploy` from CI or locally; preview per branch. Rollback is a previous version id, not a rebuild.

## Not yet

DDoS-Guard, image proxy, own player, R2.

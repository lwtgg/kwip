# Infrastructure

## Target

Cloudflare Workers via Nitro `cloudflare_module` preset. Free plan until 100k requests/day, then Workers Paid ($5/mo, 10M requests).

Escape hatch kept working: `nitro.preset = "node-server"` on a Hetzner CX22 behind Cloudflare proxy. Nothing host-specific outside `nuxt.config.ts` and `wrangler.toml`.

## Requirements

- `wrangler.toml` with `compatibility_date`, no secrets committed
- `[assets] binding = "ASSETS"` stays: a Worker fetch of its own custom domain times out, so same-origin feed reads go through the binding
- `NUXT_PUBLIC_SITE_NAME`, `NUXT_PUBLIC_FEED_BASE` from env; no literal feed URL in components
- Cache headers come from `nuxt.config.ts` `routeRules`, not dashboard rules: HTML 30s + `stale-while-revalidate=300`, immutable hashed assets, `no-store` on `/api/*`
- `/api/domains` returns our mirror list from the committed `public/domains.json`, sanitised against `NUXT_PUBLIC_CANONICAL_HOST` when set
- `pnpm build` must pass with both presets

## Domains

Registered at Porkbun. Nameservers delegated to Cloudflare; both zones on the Free plan, SSL/TLS **Full (strict)**, zone apex and `www` served by the same Worker deployment. Registrant email and Cloudflare account are on the same dedicated mailbox; 2FA on both.

| Role | Domain | Registered | Renewal | Auto-renew |
|---|---|---|---|---|
| Canonical | `kwip.fyi` | 2026-11-17 | $5.66 flat | on |
| Mirror | `kwip.lol` | 2026-11-17 | $26.26 | off |

Mirrors never diverge in content; see rule 13 in `DECISIONS.md` for the canonical/301 enforcement. Adding a mirror means: register, delegate NS to Cloudflare, add a Worker custom domain in `wrangler.toml`, add its host to `public/domains.json`. No `.com` until the brand earns one.

## Deploy

`wrangler deploy` from CI or locally; preview per branch. Rollback is a previous version id, not a rebuild.

Runtime vars go on a version, never in `wrangler.toml`. `wrangler versions upload --var KEY:VALUE` splits on every colon, so a JSON value (`NUXT_PUBLIC_BANNER_CREATIVES`) arrives under a mangled name: pass it as a `[vars]` entry in a throwaway config copy (absolute `main`/`assets` paths, since a config outside the repo resolves those against its own directory) and upload with `--config`. The flag is `NUXT_PUBLIC_ADS`. Both are live from `04f7be6d`.

## Source health

The snapshot publisher probes source URLs on registered hosts only, inside the detail window and excluding 24/7 channels, and writes the result into the generation as `health.json` alongside the feed payloads. A host is a row in `scripts/probe-source-health.mjs` (URL shape, body markers, concurrency); unknown hosts stay unprobed rather than assumed healthy. The probe is bounded: 3 s per hop, 2 in flight per host, 40 sources per run, and one failing source never fails the publish.

The Worker serves it at `/api/source-health?generation=<commitId>`, `no-store`, and the page fetches it after render for the generation that supplied the detail. A missing, unparsable or expired `health.json` is unknown health: no error, no 404, no `snapshotUnavailable`, and the picker order unchanged.

Health is a tiebreak only. It may reorder sources inside one quality and locale band, never across a band, and a failing source gets a `degraded` chip while staying selectable and linked. Nothing is removed because of health.

## Reading the logs

Page requests log `page_start` and each cache boundary with the ray, so a request that stalls is matchable to its lines. 5xx counts in raw analytics are **not** user-facing errors: every 504 in the day of 2026-11-21 was `requestSource: edgeWorkerCacheAPI`, Cloudflare's internal record of a `caches.default.match()` miss (its `PUT 204` partner is `cache.put`). Filter `requestSource: eyeball` for real requests; `cache.match` misses appear there as `originResponseStatus: 0`, which is normal and not evidence of a dead origin.

## Not yet

DDoS-Guard, image proxy, own player, R2.

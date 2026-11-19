# Task 24 — read snapshots from R2

The publisher exists. The Worker still serves the bundle's seed. Add the read path from [the freshness design](../docs/freshness-design.md), so SSR renders the newest committed generation instead of the one that happened to be deployed.

Read `docs/freshness-design.md` sections "Reader and adapter", "Stale bar" and "Failure states", plus `.agents/skills/workers-best-practices/SKILL.md`.

## Binding

`wrangler.toml`: add an `r2_buckets` binding named `FEED_SNAPSHOTS` to `kwip-feed-prod` with `preview_bucket_name = "kwip-feed-preview"`. Keep the `ASSETS` binding exactly as it is. `nuxt.config.ts` exposes it, and the server resolves it structurally, so a missing binding stays a normal unbound run.

## The adapter

New `server/utils/snapshot.ts`, exporting a reader built per request:

- `open()` reads `current.json` **once per request** and memoises it for every parallel consumer in that response. Everything from that manifest is then read by byte range: `endpoints` gives `offset` and `length` for the requested path.
- Validation, all of it before any payload is trusted: `schema === 1`; `commitId` matches `^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$`; `payloadKey` is `snapshots/<commitId>.bin`; offsets contiguous from 0, last `offset + length === size`; exactly one entry per path, no duplicates; every path present in the manifest resolves; `publishedAt` and `*VerifiedAt` parse.
- Payloads keep the existing `success` handling, host-token substitution and `fromCache` provenance.
- Only external feeds on Workers use this. Fixtures, `ping` and the unbound Node path keep their current behaviour.

## Generation pinning

- One generation per SSR response. The manifest read is shared, so parallel consumers cannot straddle two generations.
- **A valid manifest that omits a path is authoritative.** That detail is unavailable — the page's normal unavailable state, not a different event. Never fill one hole from the seed.
- If the generation is unreadable (missing manifest, corrupt range, failed validation), retry the **whole response's** feed requirements against the bundled seed once, before any payload is serialised. If that also fails, render a mountable unavailable page that the browser refetch can recover.
- `server/routes/sitemap.xml.ts` goes through the same reader and simply omits unavailable entries; an empty but valid sitemap is fine.

## Freshness

Do not change `app/composables/useFeedFreshness.ts`. It keeps the origin timestamp and the 20-minute threshold. An unchanged manifest leaves the origin untouched, so the bar still shows honestly when the feed itself is old.

## Budget

Free CPU is 10 ms. Range reads cut I/O but parsing, validation and substitution all stay on that budget.

Local `wrangler dev` CPU cannot be converted to deployed CPU, so **the gate is deployed evidence only**. Upload a preview version with `wrangler versions upload` and hit each route at least 20 times cold, capturing the platform's own `cpuTime` and `outcome` from `wrangler tail --format json`, including failed invocations. Report p50, p95, max and the bundle delta per route. A 1102 / `exceededCpu` counts as a breach.

Required first, before measuring: an isolate-scoped cache of the parsed manifest keyed by ETag, and of validated payloads keyed by payload key plus range, so a repeated publication reuses the parse instead of redoing it. Keep request-bound R2 objects out of the cache. Trim hydration payloads and skip recursive host substitution when the payload carries no host token.

If the listing still breaches after those, report the numbers and stop rather than shipping.

## Rules

- No new runtime dependency.
- `server/**`, `nuxt.config.ts` and `wrangler.toml` are yours. Leave `app/**` alone except nothing at all if you can help it.
- Never log payload contents, the credential or the whole manifest.

## Offline verification

Unit tests with a fake bucket object covering: a good read, a manifest missing a path → unavailable, a corrupt range → whole-response seed retry, a manifest failing each individual validation rule, duplicate path, and the sitemap omitting a missing entry.

Stop condition: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build` and `wrangler deploy --dry-run` pass. Preview-upload a worker against `kwip-feed-preview` and show: a listing and a detail rendering from R2 rather than the seed, the seed path after deleting `current.json` in preview, and the CPU and bundle numbers. Reply with the measurements and what the seed fallback did.

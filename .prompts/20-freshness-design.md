# Design 1 — feed freshness without a human deploying

Design document task. Produce a written design in `docs/freshness-design.md`, not code.

## The problem

`kwip.fyi` is a live sports event directory on Cloudflare Workers. The provider (`api.ppv.st`) blocks Cloudflare egress IPs: every Worker-side fetch returns `{"success":false,"error":"IP blocked. Please stop harassing our API."}`. Headers make no difference.

So today the Worker serves a build-time snapshot from `public/feed-cache/` (written by `scripts/snapshot-feed.mjs`, served through the `ASSETS` binding), SSR renders it, and the browser refetches the provider directly on mount. `pnpm deploy` is `pnpm snapshot && pnpm build && wrangler deploy`. A snapshot costs ~212 provider requests.

Consequence: the directory is only as fresh as the last deploy. Between deploys, live events end and stay listed, new events never appear. A visitor sees a museum.

## Target

Listings and detail pages no older than a few minutes, with no human involved, on Cloudflare's free tier (100k req/day), and without the site going 503 during the refresh.

## What the design must decide, with a recommendation each

1. **Trigger.** GitHub Actions `schedule` cron vs Cloudflare Cron Trigger vs an external scheduler hitting a route. Cover: minimum achievable interval in practice (GitHub cron is best-effort and skews 5–15 min under load), concurrency and queueing, whether the schedule dies silently when it is not run, and which of these can even reach the provider (Actions runner IPs are not blocked; Cloudflare is). Say which is workable and which is not.
2. **What runs.** Full `pnpm build` + deploy every cycle (slow, and 503s on every deploy) vs snapshot-only + publish the snapshot somewhere the Worker already reads. Consider: writing `public/feed-cache/` and deploying only the assets, or moving the snapshot to KV or R2 and having `server/utils/feed.ts` read it. Cost out each: build minutes, provider request count, Worker bundle, KV/R2 read and write pricing at this size, and 100k req/day headroom. `server/utils/feed.ts` `fetchFeedSnapshot` and the `ASSETS` binding are the existing seams; treat them as changeable but say what breaks.
3. **Change detection.** Only publish when the payload actually changed (hash the two list documents), so a quiet night costs nothing and readers are not handed a new build every 10 minutes. Note the interaction with the 20-minute stale bar in `app/composables/useFeedFreshness.ts` and the feed's own timestamps.
4. **Failure.** Provider 5xx, provider blocking the runner, partial snapshot (some detail fetches failed — the current script fails the whole run), GitHub Actions downtime, KV write quota. State machine: how long the previous snapshot is kept, when the site tells the visitor the data is old, and what the alarm is. The current script is all-or-nothing on purpose — keep that property or justify dropping it.
5. **Secrets and blast radius.** Which credentials the runner needs (Cloudflare API token, scopes) and how to keep a compromised runner from doing more than publishing a feed. Actions secret vs environment-scoped, and whether the token can deploy at all or only write KV.
6. **Costs.** Per day at every candidate interval, including the free-tier limits it touches. Free tier is 100k requests, 1000 KV writes/day and 100k KV reads/day — check the current numbers rather than assuming.
7. **Risks and rollback.** What happens when the provider changes shape, when they rate-limit a known runner IP, when the snapshot is empty, and how to get back to today's behaviour in one commit.

## Constraints

- No media proxy. No auth. No new runtime dependency without justifying it against rule 9.
- The browser-side direct refetch stays: it is the only live path and it works.
- Mirrors (`kwip.lol`) must keep working identically.
- The Worker must keep serving a valid page when the snapshot is missing entirely.

## Output

`docs/freshness-design.md`: problem, options table with the facts above, recommendation with reasons, step-by-step implementation sketch (files and commands, no diffs), cost table, failure state machine, risks, rollback. Be concrete about numbers and names. Where you are unsure, say so and say how to check. Under 400 lines.

Also append a short paragraph to `ROADMAP.md` § 1 recording which option the design recommends.

Read `DECISIONS.md` (rules 13–17 especially), `CONTRACT.md`, `INFRA.md` and `server/utils/feed.ts` before writing. Do not edit `app/**` or `server/**`.

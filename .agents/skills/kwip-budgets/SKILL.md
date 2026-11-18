---
name: kwip-budgets
description: Measure kwip's Worker bundle, route weight and response headroom before shipping. Load with verification-before-completion for any task that adds a dependency, an image, a component or a route.
---

# kwip budgets

Free-tier Cloudflare: 100k requests a day, and every visitor costs a Worker invocation. A snapshot build also costs ~212 provider requests per deploy. Keep both down.

## Before shipping

1. `pnpm build` and record the Worker bundle size:
   `du -sk .output/server | cut -f1` and `ls -l .output/server/index.mjs`
   Flag a jump over 10% or any new client chunk over 40 kB gzipped.
2. `pnpm exec wrangler deploy --dry-run 2>&1 | grep -iE "warning|size|Total Upload"` — any new bundler warning is a defect, not noise.
3. Client JS: `du -sh .output/public/_nuxt` and compare to the previous build. A dependency must justify its cost in the task reply.
4. Images: no new raster over 120 kB except a deliberate social card; `public/og-default.jpg` at 141 kB is the ceiling.
5. Request count: a page must not add a network request that repeats work the feed already did.

## Hard rules

- No new dependency without a rule 9 sign-off in the task reply and a justification in the commit message.
- No runtime image processing, no media proxy.
- A skill, tool or component that costs more than ~10 kB gzipped needs to replace something, not sit beside it.
- Deploys are user-visible: the site 503s for a few seconds afterwards, so never batch unrelated work into one deploy.

## When a budget is breached

Say so plainly in the reply with the before/after numbers. Do not shave the budget by lowering the numbers; shave the code.

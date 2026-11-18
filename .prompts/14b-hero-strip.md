# Task 14b — P1: hero secondary strip

`DESIGN.md` P1 item 7. One feature. The shield task (14a) may have landed before you start — leave its control alone.

The front page's hero is a single event. When that event ends or is stale, there is nowhere obvious to go. Add a compact strip directly under the hero so the page always has a next step.

## Behaviour

- Under the hero, above the reserved leaderboard ad: a row of up to three compact items from the same directory, on a hairline top border, labelled by a small `Next up` heading.
- Choose them in this order, skipping the hero event itself and skipping anything already shown in the rails when a rail is visible: the next three upcoming events by soonest `starts_at`; if fewer than three exist, top up with the most-watched live events that are not the hero.
- Each item is a `NuxtLink` to its event page: poster thumbnail (or the existing gradient/monogram fallback), name clamped to two lines, category, and a `StatusPill`. Height stays compact — no full cards, no rails, no horizontal scroll.
- Render the whole strip (`heading` included) only when at least one item exists, and never when `?filter=live` or `?filter=upcoming` is active — those already narrow the page.
- Layout: one column at `sm` and below, three columns above. 44 px minimum tap height on mobile.

## Rules

- No new dependency, no new route, no copy beyond `Next up`.
- Reuse `PosterFallback`, `StatusPill` and `formatViewers` conventions; do not duplicate their logic.
- Do not touch `app/composables/useFeed.ts`, `usePlayerSources.ts`, `server/**`, the player, or the logo/favicon.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, `/` shows the strip with real upcoming events below the hero and never repeats the hero, the strip disappears on `?filter=live`, and 390 px has no overflow. Reply with files, outcomes, and what you checked.

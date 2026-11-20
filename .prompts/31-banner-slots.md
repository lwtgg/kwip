# Task 31: fill the reserved banner slots

Rule 22 and rule 6. The slots already exist and are already reserved at their exact dimensions (`AdSlot.vue`), so nothing here may introduce reflow — the box is there before and after the creative paints, and if the creative never paints the box still occupies the same height.

There is no ad network yet, so this task must earn money from creatives we can set ourselves, and stay a clean swap when a network arrives.

## Shape

1. **House creatives from configuration.** A per-placement creative (image, destination, alt text) comes from runtime config, so a sold banner is a config change and not a deploy. No network script in this task.
2. **Nothing renders when it cannot be filled.** With `ads` off, or no creative for a placement, the slot renders nothing at all — no dashed empty box on a page that has no ads. The page must never show an empty reservation in production.
3. **The box is stable.** Fixed dimensions per format at each breakpoint, exactly as now. `width`/`height` attributes on the image, `loading="lazy"` and `decoding="async"`, `object-fit: cover`, overflow hidden. CLS contribution must measure zero.
4. **Server-side rendered.** The creative is in the SSR HTML, so it is inside the edge cache and needs no client fetch. Respect the existing cache rules; do not add a cache key dimension unless a creative actually changes per request.
5. **Click accounting is separate from the click-under.** A banner click goes through `/go/<placement>` like the click-under does so destinations stay configuration, but it must not consume or be consumed by the per-session click-under cap. Extend the handler's allowed placements rather than overloading `source`/`play`.
6. **Honest labelling.** `Advertisement` is a real, visible-but-quiet label, not `aria-hidden`. The link is `rel="sponsored noopener noreferrer"` and the image carries the configured alt. Affiliate creatives are not distinguishable from sold ones in the UI.

## Places

- Event page: one leaderboard below the player, where the reserved slot already sits.
- Homepage and `/vods`: keep their existing reserved slot filled the same way.
- Event page rail (`rail` format) only if the layout already has a place for it; do not invent one.

## Rules

- Behind `runtimeConfig.public.ads`, default off; off means the current rendering exactly.
- No new dependency, no third-party request, no consent surface.
- Tokens only; no magic colour, radius or spacing. Label text is quiet, not a second heading.
- A creative with a missing image degrades to the label and the fixed box, never to a raw broken icon.

## Verify

- Unit tests: off flag, missing creative, missing image, image failure, per-placement isolation, and that a banner click leaves the click-under cap untouched.
- Playwright at 390 px and 1280 px with and without a creative: CLS measured before and after, exactly one creative per page and per back navigation, no request to a third-party host, keyboard reachable, and the label announced.
- `pnpm build`, `pnpm test`, `wrangler deploy --dry-run` clean, and the flag left off in production.

`CONTRACT.md` scope. Report the measured CLS numbers rather than asserting "no shift".

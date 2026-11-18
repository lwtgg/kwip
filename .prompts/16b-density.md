# Task 16b — P2: density switch

`DESIGN.md` P2 item 12. Mirrors the theme mechanism exactly; no new dependency.

Add a comfortable/compact choice that thins the card and rail rhythm for people who want more titles on screen. Comfortable is the default and must look exactly like today.

## Behaviour

- New `app/composables/useDensity.ts` alongside `useTheme`: a `density` cookie (`comfortable | compact`, one year, `sameSite: 'lax'`, path `/`), `data-density` on `<html>`, default `comfortable`, and a no-flash script in the head shaped like `NO_FLASH_SCRIPT` so a compact visitor never sees a comfortable paint first. `resolveDensity(cookieValue)` ignores garbage.
- Extend the existing head script rather than adding a second one if that stays readable.
- Header control in `app/layouts/default.vue` next to the theme toggle: a `<button type="button" :aria-pressed>` with a compact icon, `min-h-11 min-w-11` at `sm` and below, `title` and `aria-label` "Compact layout" / "Comfortable layout" as it flips.
- Tokens in `app/assets/css/theme.css`: `--card-pad`, `--card-gap`, `--grid-gap`, `--rail-gap` with comfortable values that reproduce today's numbers, and a `[data-density='compact']` block that cuts them. Consumers:
  - `app/components/StreamCard.vue` — card padding and the internal gap.
  - `app/components/Rail.vue` — the row gap.
  - `app/pages/index.vue` — the upcoming grid gap.
  - `app/pages/vods/index.vue` — the archive grid gap.
- Compact also drops a card title by one step (`text-sm` → `text-[13px]`) and the media aspect stays untouched, so posters never squash.
- Mobile tap targets stay at least 44 px tall in both modes.

## Rules

- No new dependency, no new route, no copy beyond the two aria labels.
- Do not touch the hero, the player, `app/utils/*`, `app/composables/useFeed.ts`, `server/**`, or the logo/favicon.
- Light theme must be no worse in compact than in comfortable.
- Respect `prefers-reduced-motion` on any transition.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, toggling compacts the grids immediately, the choice survives a reload without a flash of the other mode, comfortable matches today pixel for pixel, and 390 px has no overflow in either mode. Reply with files, outcomes, and what you checked.

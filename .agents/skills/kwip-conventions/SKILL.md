---
name: kwip-conventions
description: This project's own Tailwind, Nuxt and component conventions for kwip. Load before writing or reviewing any UI in this repo, alongside tailwind-best-practices.
---

# kwip UI conventions

Upstream Tailwind advice is generic. These are the local specifics it does not know.

## Tokens

`app/assets/css/theme.css` is the only place values live. Available:

- colour: `bg`, `surface`, `surface-2`, `border`, `fg`, `muted`, `accent`, `accent-fg`, `live`
- geometry: `--radius`, `--radius-card`, `--focus-ring`
- density: `--card-pad`, `--card-gap`, `--grid-gap`, `--rail-gap` — consume with `p-(--card-pad)`, `gap-(--grid-gap)`, never with a literal

Classes like `bg-surface`, `text-muted`, `border-border` are already token-backed. Prefer them over arbitrary colour values. Arbitrary values are acceptable only for one-off geometry (a 72 px thumbnail, `min-h-11`), and a repeated one-off belongs in the token file.

## Components

- `StatusPill` owns status text; never hand-roll a live/upcoming/ended label.
- `LiveProgress` owns the window bar; pass `starts-at`, `ends-at`, `always-live`, `now`.
- `PosterFallback` owns poster-less art; give it `name`, `colors` and `blurhash`.
- `StateBlock` owns empty/error/stale/skeleton blocks.
- `formatViewersCompact` / `formatViewersExact` in `app/utils/viewers.ts` own viewer counts. Dense text, exact number in `aria-label`.

## Nuxt

- `~` imports for anything outside the current directory; auto-import only for `ref`, `computed`, `useState`, `useHead`.
- Anything touching `window`, `localStorage` or `document` runs in `onMounted`, never at setup top level.
- Derived state is `computed`; `useState` keys are namespaced (`ui:`, `player-shield:`).
- Anything time-based gets `data-allow-mismatch` on the interpolated node.

## Interaction

- 44 px minimum tap height at `sm` and below (`min-h-11` on the control itself).
- Focus must survive a remount; `SourceSelect` holds it deliberately.
- Reduced motion: gate transitions with `motion-safe:`.

## Copy

Sentence case, no exclamation marks, no "streaming" or "piracy" words. Short sentences that state the situation and the next action.

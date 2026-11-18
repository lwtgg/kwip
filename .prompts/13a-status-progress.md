# Task 13a — P0 design pass, part 1: status, progress, poster fallback, focus

`DESIGN.md` P0 items 1, 2, 5, 6. Items 3 and 4 are a separate task and are **not** in scope here — do not touch the source switcher or the category bar.

The site works; this is perceived quality. Keep every existing route, prop contract and state. Tokens live in `app/assets/css/theme.css` only. Dark is the default and light must stay correct.

## 1. `StatusPill.vue` (new)

One component, one pill, one state per instance — status can never be asserted without a state.

- Props: `startsAt: number`, `endsAt: number`, `alwaysLive?: number`, `now?: number`.
- States, chosen in one computed: `always_live === 1` → `24/7`; `startsAt === 0` and not always-live → `Event`; `now < startsAt` → `Upcoming in <label>`; `now < endsAt` → `Live`; otherwise → `Ended <label>`.
- `Live` keeps the current pulsing-dot treatment and `bg-live`. `24/7` and `Upcoming` use `bg-surface-2`. `Ended` uses `bg-surface-2` muted. All keep the current `text-[11px] font-semibold uppercase tracking-wide` scale (sentence case for the ones with time).
- `<time :datetime>` inside where there is a timestamp; `aria-label` gives the sentence in full (`Ends in 42 minutes`, `Started 18 minutes ago`).
- Replace the ad-hoc label spans in `StreamCard.vue` (both variants) and the hero in `app/pages/index.vue`, and the status block on `app/pages/live/[...uri].vue`. Delete the now-unused `isLive`/`isAlwaysLive` spans from `StreamCard`.

## 2. Time-label helper (new composable)

`app/composables/useEventWindow.ts`: pure exported functions, no Vue state — `formatRelative(deltaSeconds)` → `42m`, `2h 14m`, `3d`; `windowLabel({ startsAt, endsAt, alwaysLive, now })` → `{ text, aria }` returning `Ends in …` / `Started … ago` / `Upcoming in …`. Match the copy in item 1. Reuse, don't duplicate string logic across components.

## 3. `LiveProgress.vue` (new)

- Thin bar (`h-1`, `rounded-full`, track `bg-surface-2`, fill `bg-live`) with `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow` rounded percentage, and `aria-label` from the window label (`52 minutes remaining` etc.).
- Renders nothing when `alwaysLive === 1`, `startsAt === 0`, or `endsAt <= startsAt`.
- Drive purely from the existing `now` prop the pages already tick every second — no new timers, no `Date.now()` inside the component.
- Placement: under the status line in `StreamCard` (both variants, above the category row), under the metadata line in the live event page header, and once under the hero metadata in `app/pages/index.vue`. Width is the container; no layout shift when hidden.
- Card space is tight: at card size it is the bar alone (no text); the event page shows the relative text next to it.

## 4. Poster-less fallback

In `StreamCard`, when a card renders without a poster, the media block becomes `linear-gradient(135deg, colors[0], colors[1])` (fall back per stop to `--color-surface-2` / `--color-surface`), with a centred monogram from the event name (first letters of the first two words, uppercased, `text-2xl font-bold`, `text-white/70`). Add a soft bottom scrim so the corner badges stay legible. Send the hero in `index.vue` down the same path when `heroStream.poster` is missing or errors. Keep the image path exactly as it is when a poster exists.

## 5. Focus tokens

- Add `--focus-ring: var(--color-accent)` to both themes in `theme.css` and drive the existing global `:focus-visible` from it.
- Rails are horizontally scrollable and currently clip the ring; give the scroll container `scroll-padding` and enough `py`/negative-margin so a focused card's ring is visible, or switch rail children to `outline-offset: -2px` — pick whichever keeps the ring fully visible without changing the visual spacing.
- The player overlay and `SourceSelect` must show the ring above the iframe; no `outline-none`/`outline: none` anywhere.

## Rules

- No new dependency, no new route, no copy rewrite beyond the time labels, no colour-palette rework.
- `prefers-reduced-motion` already short-circuits animations globally; the progress bar is width-only so it must not transition.
- Dark first, then check light.
- Do not edit `app/composables/useFeed.ts`, `usePlayerSources.ts`, `server/**`.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, `/` and a live event page render with real data, the browser console is clean, a full keyboard Tab run shows a visible ring on every control, and at 390 px there is no overflow and the card grid stays intact. Reply with files, outcomes, and what you checked.

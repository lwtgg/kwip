# Task 13b — P0 design pass, part 2: source chips, category bar

`DESIGN.md` P0 items 3 and 4. Items 1, 2, 5 and 6 are already landed — do not rework them.

## 3. Source switcher as chips

`app/components/SourceSelect.vue` becomes a wrapping chip row on top of the existing select.

- Props stay `sources: SelectableSourceOption[]` and `modelValue: number`; the same `update:modelValue` contract, so `?source=` handling on the event page keeps working untouched.
- One `<button type="button" role="button">` per source, `aria-pressed="true"` on the active one, its visible label the source `name` and a small trailing icon indicating `kind` (`iframe` → frame glyph, `link` → outbound arrow), inline SVG, `aria-hidden` on the icon.
- Roving tabindex: exactly one chip is `tabindex="0"` (the active one, else the first), the rest `-1`; `ArrowLeft`/`ArrowRight`/`Home`/`End` move selection and focus, `Enter`/`Space` select. Selection also follows on click. Keep the group in a `role="group"` with `aria-label="Playback source"`.
- Current chip: `bg-accent text-accent-fg`; others `bg-surface-2 text-fg hover:border-accent`. Min height 44 px at `sm` and below, natural pill height above.
- Keep the `<select>` in the DOM for the no-JS path inside `<noscript>` (same options, same label). On mount/hydration it must not flash over the chips.
- The chip row replaces the select's slot on `app/pages/live/[...uri].vue`; the visible "Change source" text label stays and points at the group.

## 4. Category jump bar

In `app/layouts/default.vue`, only advertise categories that have at least one entry (`streams.length > 0`); "All" stays first and always. A zero-entry category keeps its own `/c/<slug>` URL working — this is a nav-only filter. Keep `aria-current` and the scroll behaviour. If the current route's category is hidden from the bar (empty), it must still render as an active chip at the front so the visitor can see where they are.

## Rules

- No new dependency, no new route, no copy changes beyond the group label.
- Never drop the no-JS select, and never make a chip the only way to reach a source.
- Do not touch `app/composables/useFeed.ts`, `usePlayerSources.ts`, `server/**`, or the logo/favicon.
- Keyboard and screen-reader behaviour must survive: a full Tab run must reach every chip group once, and arrow keys must move within it.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, a live event page switches sources by mouse and keyboard with the iframe following and `?source=` updating, `/` renders a jump bar containing only non-empty categories plus All, and the console is clean. Reply with files, outcomes, and what you checked.

# Task 14a — P1: player "shield" control

`DESIGN.md` P1 item 8. One feature, contained to the player.

Some embeds spawn popups or navigate the top window. A visitor needs a per-source switch that reloads the frame in a sandbox. It is never on by default.

## Behaviour

- New `app/composables/usePlayerShield.ts`: a `Set` of shielded source keys persisted in `localStorage` under `kwip:shielded-sources`, SSR-safe (read on mount, write on change), exported as `isShielded(key)`, `toggleShield(key)`, `shieldedCount`.
- Key is the source `name` plus its index in the resolved chain, lowercased and trimmed — stable across reloads of the same event, not across events.
- Player page (`app/pages/live/[...uri].vue`): a small control next to the source chips, `<button type="button" :aria-pressed>`, label `Shield` with a shield glyph, min 44 px at `sm` and below. `title` explains it.
- When the active source is shielded, the frame renders with `sandbox="allow-scripts allow-same-origin allow-presentation"`. When not, no `sandbox` attribute at all.
- A single line under the control, only while shielded: "Popups and page redirects are blocked. Some players may stop working." and a `Reload without shield` action that clears it for this source.
- Toggling must not lose the current source: the iframe remounts with the same `src`, the load/timeout detection must still end in the loaded state, and `?source=` must not change.
- `PlayerFrame.vue`: accept an optional `sandbox` prop, forward it, and include it in the frame's `:key` so a toggle remounts instead of mutating a live document. Do not otherwise change its detection logic.

## Rules

- No new dependency, no new route, no copy beyond the two lines above.
- `localStorage` failure (private mode) must degrade to in-memory, never throw.
- The control must be keyboard reachable, and `aria-pressed` must reflect state.
- Do not touch `app/composables/useFeed.ts`, `usePlayerSources.ts`, `server/**`, or the logo/favicon.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, toggling shield on a live event page remounts the frame and it reaches the loaded state with the same source and no console error, the choice survives a reload, and unshielding clears the line. Reply with files, outcomes, and what you checked.

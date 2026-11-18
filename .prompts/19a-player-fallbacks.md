# Task 19a — player fallbacks: fullscreen and "not playing"

The frame can load and still play nothing — the embed host is flaky, and right now a visitor is stuck looking at a dead rectangle with no way forward. Give them the two honest escapes, and a fullscreen control that degrades when an in-app browser refuses it.

Load `.agents/skills/kwip-conventions/SKILL.md` first.

## Behaviour

- Fullscreen button in the row next to the source chips and the shield: `<button type="button">` with an expand glyph and `aria-label="Fullscreen"`. It calls `requestFullscreen()` on the player wrapper element. If that rejects (or the API is missing), it must fall back to opening the active source in a new tab instead of doing nothing, and must not throw to the console.
- "Not playing?" toggle, same row, `aria-pressed`, `aria-label="Player help"`, `?` glyph. When pressed it reveals one line under the row: "If the picture stays black, reload the frame or open it in a new tab." followed by two actions: "Reload player" (bumps the existing retry generation, keeping the current source) and "Open in new tab" (`<a>` with `target="_blank"` and `rel="noreferrer"` to the active source URL).
- Both controls are 44 px tall at `sm` and below, keyboard reachable with the existing focus ring, and the help line uses the same small muted style as the shield line.
- Opening in a new tab must use the currently selected source, not always the first.

## Rules

- No new dependency, no new component file, no new route.
- Do not change `PlayerFrame.vue`'s detection, the shield behaviour, or the source chips.
- Do not touch `app/composables/useFeed*.ts`, `app/utils/**`, `server/**`, or the logo.
- The help line is not rendered while the chain has failed into its "no working source" state — that state already has its own actions.

Stop condition: `pnpm build` exits 0, `pnpm test` passes, `wrangler deploy --dry-run` exits 0, the help toggle reveals and hides the line, "Reload player" remounts the frame at the same source, "Open in new tab" points at the selected source, the fullscreen button expands the wrapper in Chrome and falls back to a new tab when `requestFullscreen` rejects, and 390 px has no overflow. Reply with files, outcomes, and what you checked. Load `kwip-budgets` too if you add anything beyond markup.

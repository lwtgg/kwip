# Task 32: Remember a source that failed

A source that timed out or errored fails over to the next one in the chain, but only within that page view. Come back to the event and the dead source is the default again, and its chip looks exactly like a working one. Ten seconds of the player sitting on a frame that never loads is the most expensive thing on the page.

Remember the failure for the rest of the session and let it shape what we lead with. Read `DECISIONS.md` rule 22 only for how the chips are allowed to behave with the click-under; the rest is `app/pages/live/[...uri].vue`, `app/components/SourceSelect.vue` and `app/composables/usePlayerSources.ts`.

## Requirements

1. **Record the observation, not a verdict.** When the current frame reports an error (`handleFrameError`), record that source key against that event. Nothing else records health — a working source is inferred by absence, so no new state is written on success.

2. **Scope it tight.** Per event (`uriName`), session only, `sessionStorage` key `source-health:v1:<uriName>`, value `{ at: number; keys: string[] }` where `at` is the time of the last write. Expire the whole entry after 30 minutes. Cap at 8 keys, newest kept. Storage unavailable or malformed JSON means the feature is simply absent, never an error.

3. **Badge it.** A remembered failure renders the chip muted with ` · Failed` after the label, and `, Failed to load` in its `aria-label`. It stays selectable. One badge only: a remembered failure outranks a provider `live: false`, so a chip never shows both.

4. **Shape the default, not the order.** Remembered failures join `failedKeys` before the initial selection, so a revisit starts on the first source we have not seen fail. Chip order stays exactly as `usePlayerSources` returns it; nothing reorders under the pointer after mount.

5. **Retrying clears it.** Selecting a remembered-failed chip deletes its entry and remounts the frame (a fresh `retryGeneration`). If it fails again the error handler records it again. `handleRetryChain` and `handleRetryFeed` clear the whole entry for that event.

6. **Stay safe in SSR.** Server render has no storage and no selection, so `data-allow-mismatch` where the badge can change after hydration, and the storage read happens in `onMounted`. The session query parameter still wins over a remembered failure: an explicit `?source=` opens what it names and clears that key's entry.

7. **The existing chain behaviour does not change.** `nextPlayableKey`, `failedKeys`, the exhausted-chain fallback and the click-under cap keep working as they do. This only persists what `failedKeys` already learns.

## Tests to write

- Unit (`tests/sourceHealth.test.ts`): round trip, 30-minute expiry at both boundaries, 8-key cap, malformed JSON, storage that throws, unknown key ignored, and `read()` never mutating.
- Browser (`tests/sourceHealth_browser.py`, mirroring `tests/banner_browser.py`'s harness): force the first frame to fail, assert ` · Failed` and the `aria-label`; reload, assert the failed chip is still marked and *not* selected; click it and assert the marker clears and the frame remounts. Confirm no console error and that a fresh session shows no badge.

## Gates

`pnpm test`, `pnpm build`, `wrangler deploy --dry-run`, and both existing Playwright suites unchanged. Flag-independent — nothing here touches the ads flag. Commit in steps; one commit per requirement cluster is fine.

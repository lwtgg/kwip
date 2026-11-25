# Re-review — task 55, fifth pass

`34bf8a2` on `task/55-top-event`. `/tmp/55-rr4.log` failed: consent keyed on object identity, so any refresh under
Save-Data killed a frame the user started. The fix keys on a value string. Verify it and attack the key.

- **The key.** `JSON.stringify([uri_name, heroEmbed])` is compared for `held` and for `previous`. Is there a pair of
  events that collide, or a case where the key is `undefined` while a frame is mounted (`heroEmbed` empty but a
  frame up)? Try a real change (different uri, different embed, both at once) and confirm permission still clears
  and the frame still unmounts.
- **Refresh matrix, all under Save-Data with a frame mounted:** byte-identical, viewer count change, state flip to
  final, a `tag` change, a `starts_at` change, the stale flag flipping, and a feed arriving with `fromCache`. In
  every same-key case: frame count 1, same `src`, `Sound on`, focus on the button, no second player request. In
  every changed-key case: no frame, `Play`, no player request until tapped.
- **The hidden-tab tap.** Tap while hidden, refresh, then reveal: the frame mounts muted without another tap. Check
  the same when the refresh is a changed key — the tap must be lost.
- **Auto-mount, then Save-Data on, then refresh:** frame survives with its own key, and the `mountedPlayer`
  previous-value trick still holds.
- **Does the watch clearing `startedKey` race the tap?** `watch(heroKey, ..., { flush: 'sync' })` and the tap both
  write the same ref. Construct a tap that lands in the same tick as a key change and say which wins.
- **Regression:** unmounted always `Play`; no disabled state; focus survives tab hide and remount; sound resets on
  return; the Play scroll hit-test at 844×390, 667×375, 932×430, 1280×500 and the 200 % portraits; box only with an
  embed; taifood paused; 320/390 at 200 % footer disjointness; 58 grapheme/fit/ratio; both gutter mutations red; ad
  slot below the player; no click-under; CLS 0; hydration errors; link excludes the player; `http:` never framed.

Full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run,
every suite at 320/390/1024/1280 and `--below-fold-only`. Never build while a Worker serves.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

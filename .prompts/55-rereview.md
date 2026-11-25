# Re-review — task 55, playback fixes

`ace5a53` on `task/55-top-event`, rebased on `cbda361` (rule 27 amended: box only with an embed, Save-Data waits
for Play). `/tmp/55-rr.log` failed. Verify each finding is actually closed and that the fixes did not open a new
class.

- **Labels and focus.** `Sound on` → `Mute` → `Sound on`, `Play` under the hold, never disabled. Try the hold
  entered mid-session, a tab hide while focused in each state, and the remount: focus must stay on the button and
  the frame must come back muted. Is there any path where the button is present but does nothing?
- **Footer overlap.** The audience moved into `.hero-footer`. Assert for yourself at 320/390, 100 % and 200 %,
  normal and stale, that the audience and button are disjoint and that neither leaves the plate; check the
  audience is still shown once and only once and the accessible label still carries the audience. Is
  `content.tiers.slice(0, 2)` / `tiers[2]` sound when `detail` is empty, when the state is `vs`, and when stale?
- **The `::before` height keeper.** It duplicates the label with `content: attr(data-label)`. Does Chromium expose
  the generated text in the accessible name (double announcement)? Does it hold the height in all three label
  states, and does it survive 200 %?
- **Save-Data.** No frame, `Play` present, tap mounts muted once and stays for the visit; a non-live zlive hero
  under the hold the same; taifood under the hold still mounts paused. Does `playRequested` leak across an event
  change or a filter switch?
- **No box without an embed.** Matched hero with no embed has no box, no footer, no button, and the banner still
  passes 58. Non-match hero unchanged. Does any code still reserve on `match` alone?
- **Normalisation.** `http:` upgrades, credentials drop, trailing slash drops, case survives, `{host}` survives in
  path, query and host position. Recheck `javascript:`, `//`, `www.`, lookalike hosts and a port. Confirm the
  frame never receives `http:` on an `https:` page.
- **Publisher/reader.** A hostile provider `hero_embed` must not reach storage, and an invalid one on read must
  leave the generation readable. Check the re-serialisation path (`stored = stripped ? json(payload) : bytes`) for
  byte accounting, `fileLimit`, and that a payload with no projection still stores the original bytes.
- **Sandbox.** `playerShieldSandbox` only for zlive on the hero, none for taifood; the event page still applies
  the opt-in shield.
- **Regression:** 320 no overflow at 200 %, the 58 grapheme/fit/ratio assertions, both gutter mutations red,
  `matched-widest` the only 1024 stack, ad slot below the player, no click-under from autoplay, hydration errors,
  CLS 0, the link still reaches the event page and excludes the player.

Full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run,
every browser suite at 320/390/1024/1280. Never build while a Worker serves.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

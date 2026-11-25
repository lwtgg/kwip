# Re-review — task 55, fourth pass

`8507ae6` on `task/55-top-event`. `/tmp/55-rr3.log` failed: a taifood→zlive upgrade under Save-Data autoplayed
without a tap, and on a landscape phone the Play tap scrolled the control under the sticky header. Verify both are
closed and attack what the fixes introduced.

- **Consent is now per embed (`startedEmbed`).** Walk every transition: same event gaining a zlive projection under
  Save-Data, an embed id changing under a tap, a hero change with and without Save-Data, and a `final`→`live` state
  flip. Is there a path where a tap on one embed authorises a different one, or where a legitimate own tap is
  forgotten because `heroPlayer` is a fresh object?
- **`mountedPlayer` keeps the previous value.** Read it closely. Under Save-Data, a frame the user is watching must
  survive the flip; an unmounted zlive frame must then require Play. Check the case where the box is out of the
  viewport when Save-Data flips and comes back into view, and the case where a different zlive embed arrives while
  a frame is mounted (does the old frame stay mounted, and is that right?).
- **The Play scroll.** It uses `scrollBy({ top: top - clearance, behavior: 'instant' })` and only when the button
  is above the clearance or the box is fully below the viewport. Hit-test the button after the tap at 844×390,
  667×375, 932×430, 1280×500 and the 200 % short portraits; confirm the frame mounted, focus stayed, the label is
  `Sound on`, and nothing above the plate (banner content) is left unreachable. Does `behavior: 'instant'` hold in
  a `prefers-reduced-motion` context, and does the scroll ever move the page when the button is already fine?
- **Save-Data off again.** Turning it off while held must mount, not unmute; turning it on while audible must keep
  sound. Check the `connection` `change` listener re-reads the flag.
- **Regression:** unmounted always `Play`; labels never lie; no disabled state; focus survives tab hide and remount;
  box only with an embed; taifood still mounts paused; 320/390 at 200 % footer disjointness; 58 grapheme/fit/ratio;
  both gutter mutations red; ad slot below the player; no click-under; CLS 0; hydration errors; link excludes the
  player; `http:` never reaches a frame.

Full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run,
every suite at 320/390/1024/1280 and `--below-fold-only`. Never build while a Worker serves.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

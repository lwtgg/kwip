# Re-review — task 55, third pass

`736b6cf` on `task/55-top-event`. `/tmp/55-rr2.log` failed: the button was inert while the box was below the fold,
a non-zlive `http:` embed was still mixed content, and the footer audience was announced twice. Verify the fixes
and attack what they introduced.

- **Play and mount are now coupled.** Unmounted ⇒ `Play`, tapping scrolls the box into view and mounts muted. Is
  there any state where the label lies: Play while mounted, or `Sound on`/`Mute` while unmounted? Try a rapid
  double tap, a tap during the mount transition, a tap while the tab is hidden, and a tap while `saveData` flips
  on in the same tick. Does the scroll move the plate off screen on a long page, and does it fight a user
  mid-scroll (`block: 'nearest'` on a 693 px box)?
- **Reset semantics.** The opt-in and sound reset on a hero change. Confirm a Save-Data hero needs its own Play
  after an event change and after switching to Upcoming and back, and that a normal hero does not. Is there any
  path where `playbackStarted` survives a hero change because a mount watcher re-sets it?
- **Save-Data mid-session.** Turning it on while mounted and audible must keep the frame; turning it off must not
  remount or unmute. Check the `connection` `change` listener actually re-reads `saveData`.
- **All-embed HTTPS.** `heroFrameUrl` now upgrades any http(s) embed. Confirm `http:` zlive becomes `https` **and**
  still receives `muted=1`, that a taifood `http:` iframe is framed over https, that `{host}` and existing query
  survive, and that `javascript:`/relative still pass through unchanged. Is a provider that only serves http now
  broken on https, and does the reader still accept a stored `http:` value?
- **Accessible count once.** Footer audience `aria-hidden`, link label carries the count for matched heroes; the
  new `sr-only` exact count exists for non-match reserved heroes. Confirm the button is still announced, the
  footer is not read twice, and no hero loses the count from its link name.
- **Harness honesty.** The https cases swap the origin to `https:` and re-fetch from the worker. Does that
  genuinely reproduce mixed-content blocking (does an un-upgraded `http:` frame actually fail there), and does it
  prove red if the upgrade is removed? Run the `--below-fold-only` mode and the full suite.
- **Regression:** 320/200 % overlap, plate/box stability, focus, 58 grapheme/fit/ratio, gutters, 1024 stack, ad
  below player, no click-under, CLS 0, hydration errors, link excludes the player.

Full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run,
every suite at 320/390/1024/1280. Never build while a Worker serves.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

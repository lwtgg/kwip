# Review — task 55, the top event plays itself muted

`3e1d347` on `task/55-top-event`, rebased on `main` at `bf74f81` (58 shipped). Read rules 22, 26 and 27 and
`docs/top-event-probe.md`. Rule 27 is new and describes the plate/player split; rule 26 still governs selection,
mounting and sound.

Try to break it.

- **Selection.** Is `selectTopEvent` pure, and does the zlive preference actually fire from listing data alone
  (`hero_embed`) including supplement sources? Check that a zlive-bearing low-viewer event beats a
  higher-viewed taifood one, that no zlive falls back to viewers, that 24/7 still precedes kickoff, that the
  `upcoming` filter keeps its ranking, and that nothing live reaches kickoff. Try an item whose `iframe` alone
  is zlive, one whose only zlive is a substream, one whose only zlive is a supplement, and a malformed/hostile
  `hero_embed` (`http:`, `//`, `javascript:`, `zlive.st.evil.tld/embed/x`, a path with a trailing slash).
- **`hero_embed` is a feed-contract change.** Is it validated on read, does it stay out of the event page's
  player, does compaction add it only to listings, and is the publisher's byte accounting right under
  `fileLimit`/`snapshotLimit` (no double count, no overflow, entries still parse)? Does a generation without the
  field degrade to viewers only, without a broken frame?
- **Mounting.** Mount only on in-viewport + visible; unmount immediately on either false; remount always muted.
  Try scrolling out and back, hiding the tab, `saveData` on and off (taifood must still mount paused, saveData
  only skips autoplay), a zlive hero that is not live (`autoplay=0`), and an unmount in the middle of a sound
  session. Does the IntersectionObserver, connection and visibility listeners all clean up, and is there any
  path that leaves a frame mounted out of view or runs at 1.3 MB/s hidden?
- **Layout and reserve.** The plate must be the whole card width and the 16:9 box must be identical before
  mount, mounted and unmounted at 320/390/1024/1280, with no shift. Is the reserve also there for a matched
  hero with no embed and for the non-match hero? At 1280 the player is 693 px and the card 1065 px in an 850 px
  viewport — judge it against the fold and say whether a cap (`max-block-size` on the player box, plate stays
  full width) should land in this task, with the value you would use and what it does to the provider's own
  letterboxing.
- **Link split.** The link must exclude the player and still reach the event page; the `h1` and the accessible
  name must stay on the link; the sound button outside both, `min-h-11`, keyboard reachable, label flipping
  between action and state, disabled only while unmounted, focus retained across the remount. Never over the
  provider's controls.
- **Sandbox.** `playerShieldSandbox` was extracted from the event page — same value, one source, no drift
  between the two call sites.
- **Regression:** the 58 assertions on the hero (banner equals card width, graphemes, fit, ratio where it still
  applies), 320 no overflow, the ad slot still below the player and never above it, no autoplay counted as the
  money click, hydration error count, both gutter mutations red, `matched-widest` still the only 1024 stack.
- **Proof quality.** Does the new suite's control (removing `muted=1`) actually go red? Is the CLS measurement
  real or a no-op? Are the intercepted embed fixtures representative, and does the suite leave stray contexts or
  popups behind for other suites?

Full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run,
every browser suite at 320/390/1024/1280. Never build while a Worker serves. Also check `API.md` documents
`hero_embed`.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

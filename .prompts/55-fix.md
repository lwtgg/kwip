# Fix — task 55, review one

`/tmp/55-rr.log` failed `5419c1a`. The branch is rebased on `cbda361`; rule 27 now says the box exists only when
the event carries an embed, and that `saveData` waits for a Play tap. Fix every finding.

## Blocking

1. **Sound label.** Action labels, no state labels: unmuted shows `Mute`, muted shows `Sound on`, and under the
   save-data hold (below) it shows `Play`. Do not disable the button — a disabled control loses focus and drops
   it to `BODY` (finding 9); guard inside the handler instead. Focus must survive the remount and the hold.
2. **320 at 200 % root: the button paints over the viewer count.** Stop positioning the audience tier at 50 %
   and the button opposite it. Move the audience out of the banner for the hero and render a real plate footer in
   normal flow: viewers on one side, button on the other, `flex` with a gap, wrapping to two rows when they
   cannot sit side by side. The banner keeps its other tiers. Add a hero fixture at 320 and 390 with 200 % root
   text that asserts no overlap between the footer's two children (geometry, not eyeballing) and that the button
   target stays ≥44 px.
3. **`API.md`**: document `hero_embed` — what writes it, that it is a listing-only, validated `http(s)` URL, that
   it is the resolved embed for the hero (zlive first, else the first iframe), and that a generation without it
   degrades to viewer-only selection and a banner-only hero.
4. Also say it in `docs/redesign-55.md`.

## Important

5. **`http:` zlive.** Normalise in one place so the frame never gets a mixed-content URL and the match survives
   case, a trailing slash and credentials: upgrade to `https:`, lowercase scheme and host, drop a trailing slash
   on the embed path. Keep rejecting `javascript:` and lookalike hosts. Unit-test each.
6. **Publisher and reader disagree on an invalid `hero_embed`.** Strip a non-`http(s)` value on read rather than
   rejecting the generation, and have the publisher overwrite or omit a provider-supplied `hero_embed` it did not
   project. Test both directions: a hostile value on read must still yield a readable generation, and a hostile
   value on publish must not reach storage.
7. **`saveData` with a live zlive hero is a dead box and a disabled button forever.** Per new rule 27: under
   `saveData` a zlive hero does not mount on its own; the button shows `Play` and the first tap mounts, muted
   (remount with `muted=1`). Keep the choice for the visit. Non-live zlive under `saveData` behaves the same.
   Taifood keeps mounting paused (it has no button). Test: saveData on → no iframe, button reads `Play`, tap →
   frame with `muted=1`, second tap → sound.
8. **Empty reserved box.** Reserve only when `heroEmbed` exists (rule 27). A matched hero with no embed is
   banner-only; a non-match hero unchanged. Height assertions must cover both.
9. **Focus** is covered by not disabling. Add the tab-hide case to the suite: focus the button, hide the tab,
   return, and assert `document.activeElement` is still the button and the frame remounted muted.

## Minor

10. `heroFrameUrl` percent-encodes `{host}` when it sits in a path. Preserve it.
11. The hero must not sandbox taifood, which the probe shows rejects the sandbox: use `playerShieldSandbox` only
    for zlive on the hero. The event page keeps the opt-in shield as it is.
12. Confirm `pnpm test`, both presets, default rebuild, dry run and every suite at 320/390/1024/1280; add the
    200 % hero cells to the top-event suite at both small widths. Never build while a Worker serves. Commit, do
    not deploy, do not touch `.prompts` or `DECISIONS.md`.

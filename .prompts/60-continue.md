# Continue task 60 — codex ran out of credits mid-task

`.prompts/60-scoreboard.md` is the brief and it is authoritative. A previous agent (`gpt-6.2-sol`) hit its usage
limit after editing and before committing. Its work is in the tree, uncommitted:

- `app/assets/css/theme.css`, `app/components/MatchBanner.vue`, `app/components/StreamCard.vue`
- `tests/banner_rendered_contrast.py`, `tests/cards_browser.py`, `tests/top_event_browser.py`

`0/1` of the viewport/text-size matrix in `/tmp/kw60-gate/measure.log` has run. Nothing is committed and the gate has
not run at all, so treat the tree as an unfinished draft: read every hunk, keep what is right, finish what is not.

Requirements that matter most, because they are what the owner actually saw:

1. The state sits **between the logos**, centred on the score row — not on a row above it. Its centre and the
   scores' centre agree within 1 px at 320/390/1024/1280 and at 200 % root text.
2. The audience moves **under the detail line**, in the middle column, and off the bottom row.
3. The timeline is a **visible track in the bottom row** between the abbreviations, above the card's bottom edge,
   present whenever the window is valid (including `final`), absent for always-live and stale.
4. Hero and wide `Next up` rows use the same grid. The hero footer no longer holds the audience — only the sound
   button — and its disjointness test stays.
5. Re-measure the widest-card ratio per width and state, then set the suite floor from the measurement.

Both red controls are mandatory: put the state on its own row and show the centre assertion fail; put the audience
back on the bottom row and show the order assertion fail. Build the red version in a scratch copy, not by leaving
the tree broken.

Also confirm what the previous agent changed in `tests/cards_browser.py` did not weaken existing assertions (it is a
170-line diff, mostly reflow): the grapheme, fit and ratio checks must still fail when the thing they measure
breaks.

Gate: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, `pnpm exec wrangler deploy
--dry-run`, every suite at 320/390/1024/1280. Never build while a Worker serves. Commit, do not deploy, do not touch
`.prompts` or `DECISIONS.md`. Record measurements and the ratio decision in `docs/redesign-60.md`.

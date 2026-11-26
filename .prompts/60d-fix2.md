# 60d fix round — two failures from the gate

`9477967` on `task/60d-scores-fresh` (this worktree). Gate is red on two items; fix these and nothing else.
Codex CLI is out of quota, so you are the agent; the tree is already built and `pnpm test` passed 204.

## 1. `('box == art')` at the hero

`tests/cards_browser.py:574`: `assert box == art and len(set(geometry['radii'])) == 1`. Failing card:
`{'card': {left 8, right 312, top 730.44, bottom 1247.88, width 304, height 517.4}, 'banner': {left 8, right 312,
top 917.88, bottom 1247.88, width 304, height 330}, 'radii': ['0px','0px']}` — 320 px, so stacked: the card now
holds the item's own player above the plate because the detail hero renders its own match. The assertion assumed
the card holds only the plate. Make it compare against what the code actually guarantees: the plate box is the
card box when there is no embed and the card's bottom half when the player is stacked, and the radii under test
belong to the card's own corners. Do not weaken it to "always unequal" — state which case it is.

## 2. `('state ink centre offset', ('matched-live', 'stale', 320, 'normal'), 1.273585319519043)`

`assert_scoreboard_layout` (`:648`) allows 1 px. The stale layout drops the audience and the timeline, so the
rows shrink after the first fit pass, and the state nudge looks stale by 1.27 px. Find whether the nudge is
computed before the tiers are removed, and recompute the fit after a stale re-render rather than widening the
bound. It must hold on both engines; give the numbers you get.

If either turns out to be a genuine 60c-class layout problem that needs `MatchBanner.vue` or `theme.css`, you may
touch them — this worktree is pre-60c, so 60c will be rebased onto main separately and conflicts get resolved
then; keep such edits minimal.

## Gate

Full gate to green: `pnpm test`, both presets, default rebuild, dry run, `tests/cards_browser.py .output
--screenshots <dir>` to completion (including the pixel matrix), `tests/top_event_browser.py`. Report what you
actually ran with numbers. Commit when green.

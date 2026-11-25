# Re-review — task 58, Korean word integrity

`91e0ccd` on `task/58-banner-clean`, after `dd1c30f` and `/tmp/58-rr6.log`. That review confirmed the grapheme class
closed and failed only on Korean words breaking between syllables once wrapping went native.

Verify the fix and hunt for what the rule breaks.

- **Hangul words stay whole.** Hydrated, fallback and SSR renders at 320/390/1280, normal and 200 % root, 3×: no
  Hangul word segment may occupy two rects. Try your own beyond the fixtures — a long word, a word at the very start
  and very end of a tier, Hangul with a trailing Latin token, Hangul with `vs`, and a five-syllable word in a
  58 px track.
- **The emergency.** `overflow-wrap: break-word` is global. Does it ever split a grapheme cluster (Thai, Khmer,
  Malayalam, `؀١`)? Does it fire only when a single word exceeds the stacked row, and does the word then stay
  inside the card? Check the 20-syllable stress fixture at 320 root and at 320 normal.
- **Mixed lines.** `keep-all` applies to a whole tier, so Han or kana sharing a tier with Hangul also stop breaking
  between characters. Does that push `matched-mixed` or your own Hangul+Han string into overflow, monospace or a
  stack it does not need? Compare with `dd1c30f`.
- **The mono guard.** Monospace only applies if it is actually narrower; otherwise the attribute is removed. Are
  there cells that now overflow because mono was skipped, and does the count stay at the eight genuine
  `matched-widest` cells?
- **Han and Thai.** Han×24 still breaks per character without monospace at normal text; Thai and Khmer still break
  at word boundaries only.
- **Regressions:** 390 root `matched-live` unstacked at 58 px, `matched-widest` the only 1024 stack (per-element),
  both gutter mutations red, grapheme rects still single everywhere, ratio, centres, floor, contrast, hero, void
  text, hydration error count.
- **Harness note.** The live-progress assertion was changed in this commit to use the fixture's event window. Check
  that it still fails for a wrong progress value.

Full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run, every
browser suite at 320/390/1024/1280. Never build while a Worker serves.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

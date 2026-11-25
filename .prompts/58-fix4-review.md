# Re-review — task 58, Thai marks and the lineup minimum

`ef6830e` on `task/58-banner-clean`, after `f399996` and the review in `/tmp/58-rr3.log`. That review failed the
task on one blocking bug and two smaller items:

1. **Blocking:** the `Intl.Segmenter` fallback used `Array.from`, which split Thai vowel and tone marks off their
   consonants into dotted circles. It was also the server path, so every client painted it broken until hydration
   and a no-JS page painted it forever. `ครึ่ง` became `ค`,`ร`,`ึ`,`่`,`ง`.
2. The 1024 "nothing may stack" assertion only ran at normal text.
3. The inline-padding minimum was restated in JS as `(preferredRoom + width) / 2`, duplicating the CSS clamp and
   able to drift.

Verify the fix against real pixels and real SSR HTML.

Specific scrutiny:

- **Thai/katakana fallback.** The fallback is now `\P{M}\p{M}*|\p{M}+`. Does every combining mark stay on its base
  in the SSR HTML, in the no-JS render, and in a browser with `Intl.Segmenter` disabled before startup? Do it at
  320/390/1280 with doubled root text, 3× scale. Is the Thai detail legible and unbroken, or does it still split
  into marks? What about a leading combining mark and a mixed Latin/Thai string — does the alternation hold?
- **Server/client identity.** Is the SSR output byte-identical to the client's first render, so hydration stays
  clean? Show the hydration error count rather than asserting it.
- **Grapheme fallback for Japanese.** Katakana has no combining marks, so the fallback splits letter by letter.
  Does `クォーター` break sensibly at 320 root text, and does the katakana fixture's stacking stay justified by its
  own widths?
- **Clamp basis.** `--banner-lineup-min` is now `2 * sideMin + statusMin`. Can the padding box still overhang at
  any width, mode or fixture? Is `preferredRoom` measured with the preferred padding and `available` with the
  minimum, and does the 100 % trick resolve the same minimum in Chromium and in the built SSR CSS (which is what
  the no-JS first paint uses)? Check the actual computed padding at 390 root.
- **1024.** Nothing may stack there in any text mode except `matched-widest`, `matched-cjk`, `matched-thai`,
  `matched-katakana`.
- **New fixtures.** Do Thai and katakana get the same tier mapping, accessible name and contrast as Latin? Does
  either change the listing order or the score-centre measurement?

Then the full regression sweep: the two gutter mutations red, 390 root `matched-live` unstacked at a 58 px status
track, 1280 centres (38.5 % / 57.6 %), the 3.5 ratio at normal text, logo variants, contrast, hero, both themes and
both densities.

Full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run, and
every browser suite at 320/390/1024/1280. Never build while a Worker serves. Re-run the `Array.from` negative
control yourself.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

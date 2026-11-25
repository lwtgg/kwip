# Re-review — task 58, SARA AM and the grapheme oracle

`3888e12` on `task/58-banner-clean`, after `ef6830e` and `/tmp/58-rr4.log`. That review failed on Thai `ำ`
(U+0E33) splitting from its base on the server and with no JS, and on Thai/katakana being over-exempted from the
ratio, centre and normal-text stacking checks.

Verify both, and attack the new machinery.

- **SARA AM.** Does `ำ` (and Lao `ຳ`) now stay attached in SSR HTML, in a no-JS render, and with `Intl.Segmenter`
  deleted before startup, at 320/390/1280 and doubled root text, 3× scale? Check `กำลังแข่งขัน น้ำท่วมสนาม` and
  `ກຳລັງແຂ່ງຂັນ` specifically.
- **The regex.** It is `(?:\p{Regional_Indicator}{2}|.)${tail}*(?:\u200D(?:\p{Extended_Pictographic}${tail}*)?)*`.
  Find a cluster it still splits or a run it over-merges: combining Latin, Devanagari matras and virama, Arabic
  diacritics, Hebrew niqqud, Hangul jamo, Khmer coeng, Thai with stacked marks, emoji ZWJ sequences, keycaps,
  flags, tag sequences, skin tones, a lone `ำ` at the start of a tier, `ำ` after whitespace, and a
  zero-width-joiner at the end. Compare each against Chromium's grapheme segmenter and report any span whose
  boundary is not a grapheme boundary.
- **The oracle.** Is it actually an oracle? It runs in a separate page with `Intl` intact, asserts concatenation
  equals the source, and validates every boundary. Does it cover state, detail and audience for every fixture in
  all three render modes, and would it catch a boundary that splits a cluster? Prove it red with `Array.from`
  and with the `ำ` case removed.
- **Server/client identity.** Confirm the SSR and first-client render agree byte for byte in every render mode, and
  report the hydration error count, not just its assertion.
- **Exemptions.** Thai and katakana must now be excluded only from the 1024 stacking assertion. Confirm they are
  measured for the 3.5 ratio at 320, the 1280 centres (38.5 % / 57.6 %) and no stacking at 320/390 normal text.
- **New fixtures.** Lao, Devanagari, Arabic and the emoji detail: do they render with the same tiers, accessible
  name, contrast and no broken boxes? Does the emoji detail stay inside the card at 320 root text?

Then the established regressions: both gutter mutations red, 390 root `matched-live` unstacked at a 58 px status
track, `matched-widest` the only 1024 stack, zero broken words and overflow, floor 0.60, contrast, hero.

Full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run, every
browser suite at 320/390/1024/1280. Never build while a Worker serves.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

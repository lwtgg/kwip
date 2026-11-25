# Re-review — task 58, native line breaking

`dd1c30f` on `task/58-banner-clean`, after `3888e12` and `/tmp/58-rr5.log`. That review failed on Hangul jamo, and
found Devanagari, Khmer and prepend splits behind it. This commit drops the status spans and the segmenter entirely:
tiers render plain text, the fit measures the widest unbreakable unit with `width: min-content`, and wrapping is
native again.

Verify that the whole class is actually gone, not moved.

- **Rendered clusters.** The suite now builds one Range per grapheme from Chromium's segmenter and requires exactly
  one client rect. Does it hold for every fixture in SSR, fallback (`Intl.Segmenter` deleted) and hydrated renders,
  at 320/390/1280, normal and 200 % root, 3×? Try your own strings beyond the fixtures: Thai stacked marks, Lao,
  Myanmar, Tibetan, Sinhala, Tamil, Telugu, Malayalam, Khmer coeng, Arabic with diacritics and tatweel, Hebrew
  niqqud, Hangul jamo (initial, medial, final, three at once), precomposed Hangul, emoji ZWJ, keycaps, flags, tag
  sequences, skin tones, lone combining marks, and a mark after a space. Report any grapheme with two rects.
- **Would the assertion catch a real split?** Prove it red with the code-point control AND with one independent
  mutation, e.g. `word-break: break-all` in the built CSS if that splits clusters, or per-character spans in a
  scratch copy.
- **`min-content` measurement.** Does `unbreakableWidth` restore `white-space` and `width` on every path, leave no
  inline residue, and measure the same value twice in a row? Does it run before the fits that depend on the widths,
  and does the mono fallback fire only where a single unit genuinely exceeds the full row? Count how many fixture ×
  mode × width cells switch to monospace; SF Pro is the mockup's face and mono should be the exception.
- **Native wrapping quality.** For Thai, Hangul, Khmer and mixed strings at 320 root text, does the browser break at
  sensible boundaries rather than merely at cluster boundaries? Are the lines balanced, inside the card, and does
  the floor still hold?
- **Markup identity.** Is the SSR markup now identical to the client's first render for these tiers, with no
  segmenter in the app at all? Report the hydration error count.
- **Regression:** 390 root `matched-live` unstacked at 58 px, `matched-widest` the only 1024 stack (per-element
  only), both gutter mutations red, 3.5 ratio at normal text, 1280 centres, floor, contrast, hero, void text.

Full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, dry run, every
browser suite at 320/390/1024/1280. Never build while a Worker serves.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

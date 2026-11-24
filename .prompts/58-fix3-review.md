# Re-review — task 58, the stacked score collision

`f399996` on `task/58-banner-clean`, after `b276019` and the third review in `/tmp/58-rr2.log`. Read that log
first. Its two important findings and the minor were:

- scores collided in the stacked layout (0.8 px on `999`/`999`, card read `999999`) and the suite could not see it;
- the stack trigger fired at 390 px root text on a hard-coded 4 em rather than the real word width;
- the vertical gutter could not fail because the abbreviation row sat between score and detail;
- `Intl.Segmenter` was unguarded and would kill the banner on Firefox below 125.

Verify each against the actual pixels, and check that nothing else moved.

Specific scrutiny for this fix:

- **Score gutter.** The stacked tracks now reserve half a gutter on each facing edge inside the column minimums,
  and the shared fit subtracts it. Is the gap real and measured at every width, theme, density and text mode, with
  both scores still one line, at the shared scale, on the same row as the logos? Prove `--banner-stacked-score-gutter:
  0px` red yourself.
- **Abbreviation-to-status gutter.** High enough to be the gutter itself, not measurement slop? Prove
  `--banner-gutter: 0` red in the stacked layout yourself.
- **Stacking trigger.** The 4 em trigger is gone and the trigger is now the measured widest word at the floor.
  Check stack counts at 390 root text, that `matched-live` (Halftime) and `matched-final` behave sensibly, that
  nothing stacks at normal text except `matched-widest`/`matched-cjk`, and that no fixture silently stacks at
  1024. Is `matched-final` at 390 root stacking justified by its own word, or is the trigger still too eager?
- **New inline padding.** `--banner-lineup-min` lets the inline padding contract to half its preferred size.
  Does that move the 320 px logo/label off the mockup's edge at normal text? Check the outer composition at 320
  and 1280 normal text against the mockup `/Users/julian/Downloads/Updated Instructions.png`.
- **`Intl.Segmenter`.** Is the hydration path identical on server and client, does the fallback preserve the exact
  text, and does a Japanese fixture survive with no broken words and no hydration error?
- **Logo measurement.** `--banner-logo-resolved` is gone; the fit reads the rendered logo box instead. Does that
  still work for a missing logo, a failed logo, a long abbreviation-only label, and an empty abbreviation?

Regression sweep: tier proportion, the 1280 score centres (38.5 % / 57.6 %), contrast, the 3.5 ratio at normal
text, unmatched cards, hero, both themes, both densities.

Run the full gate yourself: `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild,
`pnpm exec wrangler deploy --dry-run`, and every browser suite at 320/390/1024/1280. Do not build while a Worker
serves. Re-run both gutter mutations and one root mutation yourself.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with measurements. No edits, no commits.

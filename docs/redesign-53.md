# 53 · The banner is the artwork

`StreamCard` now renders `MatchBanner` from the published `match`. Away stays left and home stays right.
Logos sit outside the scores; status and viewers sit between them. Missing and failed logos use initials.
Pre-game fixtures without a complete score show lowercase `vs`. The home hero uses the same component
at detail scale, with its existing information card. Its side-by-side breakpoint is 768 px.

Cards no longer read `poster` or `blurhash`, including unmatched cards. Unmatched cards use the existing
`PosterFallback` gradient and monogram with 51's plate, identity and timing lane. Matched artwork uses a
192 px plate above md and 96 px below it, stretched into the existing row height instead of setting it.
Only matched score numerals are heavy, at 700; the kickoff and every banner label are 400.

The score artwork is hidden from accessibility APIs; the link includes the full team names, complete
scores, provider detail, exact viewer count and existing facts. `LiveProgress` remains accessible and
moves into the banner, where it uses the event's start/end window. The card remains one link with no
nested interactive target. Stale cards retain the published score and existing stale qualification,
without viewers or progress.

## Colour and type

Colour values, geometry and typography live in `theme.css`. Active and hero artwork retains the original
team colours at its gradient end stops, with solid colour through 30% and from 71%. The top and bottom
receive the specified 45% shade. An additional independently computed black scrim protects opaque white
at the brightest point, with a 4.55:1 target to leave room for browser colour rounding.

Pre-game row colours use ordinary sRGB source-over at 12% over `#272624`, with the base as the middle
stop and no vertical shading. The illustrative green/red pair in 52 cannot be produced by that exact
formula from green/red primaries: those produce `#224020 → #272624 → #412120`. The implementation follows
the computed blend, and the sweep also includes the literal `#192f23 → #361f24` example.

The 96 px plate requires horizontal condensation. Score size remains 44 px on phones, 56 px above md,
and 145 px in the hero; longer scores condense proportionally. Status lines fit their own column without
breaking words. A conservative CSS fit covers SSR, and measured fitting refines each line after mount
and resize. Large visible viewer counts use the shared compact formatter; the accessible count is exact.

The owner-supplied Acumin Pro Extra Condensed Bold is bundled as a digits-only WOFF2 at
`public/fonts/acumin-digits.woff2` (1,780 B). The 700 face uses `font-display: swap`, a digit-only
Unicode range and one layout preload; Arial Narrow remains the fallback. No dependency or package
change was added.

## Measurements

Baseline: HEAD `3164f95`, built before editing. Final measurements use the same synthetic fixtures,
Chromium on macOS, both themes and both densities. Unmatched geometry is identical before and after.
Matched rows meet the same measurements, including three-digit scores and a 24-character status.

| Width | Density | Before height / ratio | After unmatched | After matched |
|---|---|---|---|---|
| 320 | Comfortable | 81 px / 3.556:1 | 81 px / 3.556:1 | 81 px / 3.556:1 |
| 320 | Compact | 73 px / 3.945:1 | 73 px / 3.945:1 | 73 px / 3.945:1 |
| 390 | Comfortable | 81 px / 4.420:1 | 81 px / 4.420:1 | 81 px / 4.420:1 |
| 390 | Compact | 73 px / 4.904:1 | 73 px / 4.904:1 | 73 px / 4.904:1 |
| 1280 | Comfortable | 116 px / 5.241:1 | 116 px / 5.241:1 | 116 px / 5.241:1 |
| 1280 | Compact | 102 px / 5.990:1 | 102 px / 5.990:1 | 102 px / 5.990:1 |

These are worst row heights and ratios across the tested fixture set, not a claim about every name's
visible length. The existing identity truncation rule still applies. Kickoffs stay intact under 200%
text enlargement, without page overflow; league labels retain their own full-width line.

## Gate run

- `pnpm test`: 173 passed, zero failures; includes two new colour/mix tests.
- `pnpm build`: Worker passed; `NITRO_PRESET=node-server pnpm build`: passed. Node HTTP smoke returned
  200 for `/`, `/c/basketball` and `/vods`. Default `pnpm build` rebuilt last and passed.
- `pnpm exec wrangler deploy --dry-run`: passed, 1068.62 KiB upload / 281.11 KiB gzip. The same 15
  `ignored-bare-import` warnings remain. No deploy was run.
- All six suites passed on the frozen final Worker build: `cards_browser.py`, `density_browser.py`,
  `banner_browser.py`, `notLive_browser.py`, `sourceHealth_browser.py`, `click_under_browser.py`.
  All include 390 and 1280; cards also includes 320, both themes and both densities. Click-under used
  `/tmp/kwip50a-baseline/.output` as its pre-feature baseline.
- Card suite: 60 ordinary page loads, 612 cards, CLS 0 throughout; 108 additional matched-row cases and
  matched hero captures. Fixtures cover live, pre-game, final, missing/failed logos, invalid/missing
  colours, bright colours, three-digit scores and long status/large viewers. Tests check score/status
  collisions, painted status containment, the single link, colour end stops and absence of thumbnail
  requests. The final suite wrote 484 screenshots.
- `node tests/cards_contrast.ts /tmp/kwip53-final-contrast.json /tmp/kwip53-published-streams.json`:
  passed 2,124 banner combinations across both themes, both scales and pre/in/post. The read-only
  published generation `20261124T085616Z-35c9aaa2` has 210 events and 75 matched pairs. Extremes,
  invalid/missing colours and the explicit muted example are also included. Worst pair is
  `#ff0900 → #df1b27`, contrast **4.5500000188:1** after the safety scrim; vertical shading only increases it.
  The existing row-field and focus contrast sweep also passed.
- Impeccable detector: no findings. Independent code review: initial logo hydration and long-status
  defects fixed; follow-up found no remaining Important defects. Its progress-accessibility note was
  resolved by hiding only the lineup, leaving the progress description exposed.
- `git diff --check`: passed.

| Budget | Before | After | Delta |
|---|---|---|---|
| Client JS, gzip -9 per chunk | 126,421 B | 128,514 B | +2,093 B (+1.66%) |
| Client JS chunks | 17 | 17 | 0 |
| CSS, gzip -9 | 7,512 B | 8,350 B | +838 B |
| Worker files, total bytes | 1,276,740 B | 1,287,597 B | +10,857 B (+0.85%) |
| Worker directory | 1,408 KiB | 1,416 KiB | +8 KiB |
| Worker entry | 253 B | 253 B | 0 |

The existing largest client chunk is 74,015 B gzip (previously 74,024 B); no new chunk exceeds 40 KiB.
Logs, JSON measurements and screenshots are under `/tmp/kwip53-*` on the test machine.

## Files changed

- `app/components/StreamCard.vue`, `CardTiming.vue`; new `MatchBanner.vue`.
- `app/assets/css/theme.css`.
- New `app/composables/matchBanner.ts`, `useMatchBannerStyle.ts`.
- `tests/cards_browser.py`, `cards_contrast.ts`; new `matchBanner.test.ts`.
- This record. `package.json` is unchanged.

## Review fixes (2026-11-24)

The missing-logo initials now derive their size from the logo box, stay on one line and clip at the
box edge. Hero status is 56 px at all three widths, with 0.9 line height so three lines fit the 162 px
phone banner. Hero abbreviations keep their earlier size independently. The score face is the bundled
owner-supplied digit subset described above; scores remain 44/56 px in rows and 145 px in the hero.

| Review defect | Before (review at a74d369) | After |
|---|---|---|
| Missing-logo `NL`, 320/390 | 15.73 px paint in 10 px box; 5.35 px score overlap | 4.64 px paint; 4.19 px score clearance |
| Missing-logo `NL`, 1280 | Unconstrained inherited type | 10.91 px paint in 24 px box; 16.24 px clearance |
| Hero status, 320/390 | 12 px | 56 px; Live, Halftime, Final and viewers fit |
| Hero status, 1280 | 28.16 px | 56 px; all tested states fit |
| Rendered contrast regression | Zero-scrim mutation passed the suite | Built zero-scrim mutation fails at 1.0:1; restored fixture minimum 4.550007:1 |

The browser contrast helper reads each live banner's resolved background layers and each banner text
colour. It samples the full interpolation between team stops under the rendered uniform scrim; the
vertical shade is transparent at the brightest middle scanline. It does not call `bannerScrim` or
rebuild intended token values. The TypeScript report labels its calculation as a model and also checks
the browser-generated measurements when supplied as its fourth argument.

With Acumin loaded, matched rows remain 81/73 px at 320 (comfortable/compact), and 116/102 px at 1280.
Both themes and densities pass at 320, 390 and 1280. The tests check two-letter initials plus `WWW`,
painted clearance, a loaded digit face, actual mounted hero states, single-line status and vertical
containment. Minimum clearance over the wider initials stress cases is 1.43 px on phones.

Fresh final gate: 173 unit tests; Node build and HTTP smoke for `/`, `/c/basketball`, `/vods`; default
Worker rebuild; deployment dry-run; all six browser suites (`cards`, `density`, `banner`, `notLive`,
`sourceHealth`, `click_under`) at 390/1280, with cards also at 320 and both themes/densities. All passed.
The zero-scrim mutation was built, failed the matched-banner suite specifically on rendered contrast,
and was removed before the final rebuild. Independent read-only review found no remaining Important
issues. No deploy was run. `.prompts`, `DECISIONS.md` and `package.json` are unchanged.

| Budget | Previous banner build | Review fixes | Change this round |
|---|---:|---:|---:|
| Client JS, gzip -9 | 128,514 B | 128,776 B | +262 B |
| CSS, gzip -9 | 8,350 B | 8,467 B | +117 B |
| Digit font, WOFF2 | 0 B | 1,780 B | +1,780 B |
| Worker files | 1,287,597 B | 1,288,546 B | +949 B |

The original +2,093 B client-JS addition becomes +2,355 B against the pre-banner baseline; including
the font, the new addition is **4,135 B**. CSS is separate: +955 B against the original baseline, making
**5,090 B** including CSS. The CSS raw import explains why additional CSS also adds some client JS.
Worker directory remains 1,416 KiB, entry 253 B. Dry-run is 1069.54 KiB / 281.34 KiB gzip, with the same
15 ignored-import warnings. No dependency was added.

Evidence: `/tmp/53-fix-final-gate.log`, `/tmp/53-fix-mutation.log`, `/tmp/53-fix-captures/`,
`/tmp/53-fix-initials.json`, `/tmp/53-fix-budget.json`, `/tmp/53-fix-contrast.json`.
Changed files this round: `app/assets/css/theme.css`, `app/layouts/default.vue`,
`public/fonts/acumin-digits.woff2`, `tests/cards_browser.py`, `tests/banner_rendered_contrast.py`,
`tests/cards_contrast.ts`, and this record.

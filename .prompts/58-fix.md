# Fix — task 58, six from review

`/tmp/58-review.log`. Proportion, tiers, fonts, logo position, the ratio floor and the no-info composition
stand. These six are real; fix all of them.

1. **Scores touch the detail at 200 % text** (`theme.css:505`, `MatchBanner.vue:20`). No column gap and the fit
   stretches to within 1 px. At 320/200 % `50` and `Halftime` are 2.1 px apart and `108Halftime111` reads as one
   word; `148` is 0.2 px from a 24-character detail. Give the middle column a real gutter at every width and
   every text size, and make the test's overlap tolerance strict enough to catch it — the current 0.25 px
   excusal is why this passed. Check the pre-game card at 200 % too (`cards_browser.py:443` skips it), including
   its tier line boxes, which overlap by 1.4 px now.

2. **The fit has no lower limit, so 200 % is undone** (`MatchBanner.vue:20`). A 24-character detail is drawn at
   0.35, `WWWWW` at 0.44, `1.2m Viewers` at 0.66. Add a floor so text cannot shrink past legibility; when the
   floor is reached, let the row grow (height only) rather than compress further. Report the floor and the
   worst drawn ratio at 320/200 % after the fix, and keep the ratio floor at normal text.

3. **At 1280 the scores sit too far out** (`theme.css:467-468,505`). Mockup score centres are 38.5 % and 57.6 %;
   the build is 26.6 % and 73.4 %, about 73 px of dead space each side. Narrow the middle columns at `≥64rem`
   so the scores land within a few points of the mockup, without shrinking the logos (they already match).

4. **The bottom-right "Arizona" cannot occur** (`cards_browser.py:391`, `docs/redesign-58.md:18`). The feed caps
   abbreviations at 5 (`snapshot.ts:109`, `scoreboard.mjs:37`), so real data gives `ARIZ` and the test fixture
   hid it by setting `abbreviation='Arizona'`. Keep the two-abbreviation symmetry, but state it in the doc as a
   deliberate departure from the mockup, test with a real 5-character abbreviation, and cover the empty
   abbreviation case (nothing may be left blank under the logo with no fallback).

5. **The accessible name drops the visible state** (`matchBanner.ts:18`, `StreamCard.vue:84-85`). Measured name:
   `… 97, Halftime 62 viewers. Kickoff … 50`. "Live"/"Upcoming" is on screen but missing from the name, a `pre`
   card says "Scheduled" visually vs "Upcoming", there is no separator before the viewer count, and the progress
   bar's `aria-valuenow` leaks as a trailing `50`. Build the name from the same content the banner shows, in the
   same words, add separators, and keep the bar out of the name. Keep one link and no nested interactive target.

6. **Three-digit scores are always squeezed** (`theme.css:541`). At 1280 `101` is drawn at 0.567 beside `99` at
   0.85 in a ~70 px column with room to spare. Size score columns for three digits and fit both sides
   equally, so `50`/`97` and `101`/`99` draw at matching scale and only shrink when the column is genuinely
   tight.

Gate as before, plus 200 % on every matched fixture (live, pre, three-digit, long detail, missing and failed
logo, empty abbreviation), both themes and densities, all three widths, with before/after numbers for each of the
six. Mutation proofs for the new gutter and the fit floor. Commit, don't deploy, don't touch `.prompts` or
`DECISIONS.md`; update `docs/redesign-58.md` with the abbreviations departure and the new measurements.

# Brief — task 58, the banner is the whole card

The owner rejected 53's card. Open `/Users/julian/Downloads/Updated Instructions.png` first and look at it: an
annotated screenshot with a "before" card on top and two "after" cards below, plus the note "There is no need
for that extra info. Just make this the whole banner thumbnail of the stream." The "before" is the shipped card.

What is wrong with it: a matched card is a thumbnail plus an information column, so every row repeats the
category line (`Basketball · College Basketball`), the long fixture sentence (`Colorado State Rams at Arizona
State`) and a UTC kickoff. The "after" card has none of that. Its whole surface is the thumbnail, carrying only:

```
                    Live
            50     Halftime     97
       CSU      62 Viewers      Arizona
```

Top: the state. Middle: the two scores either side of the provider detail. Bottom: the away abbreviation, the
viewer count, the home name on the outer edges — over the team gradient with both logos. Fonts are the note's
own: SF Pro for text (our `--font-sans`), Acumin Pro Extra Condensed for the scores (already bundled).

## What to change

- **Matched cards only** (`stream.match`): drop the `card-info` column entirely — no category, no title
  sentence, no `CardTiming`, no UTC, no "Watch". The `MatchBanner` fills the card. Keep an `sr-only` block with
  the existing full accessible label (teams, scores, detail, exact viewers, time) so the link still reads.
- Rearrange `MatchBanner` into the three tiers above (top state, middle scores + detail, bottom abbrevs and
  viewers), matching the mockup's order, not today's single horizontal line. State keeps `Upcoming` for `pre`
  and `Final` for `post`; only the mockup's `Live`/`Halftime` need to match exactly. `vs` stays for a pre game
  without a complete score.
- **All cards**: the artwork is the whole card, full-bleed, square inside the existing row radius. The banner's
  outward corners follow the card's, not an inner plate.
- Body text and numerals small and quiet; only the score stays heavy at the hero scale. Keep the existing fit
  and condensing so a three-digit score and a long `Halftime` never collide or wrap.
- Row geometry: matched rows must not get worse than 3.5:1 at 320. Measure and report; if the three tiers cannot
  fit the current row height, say so and show the smallest height that keeps them legible at 320 before changing
  it, with the ratio.
- The hero uses the same banner at detail scale; its art/info split at 768 goes away, and no `CardTiming` line
  is added back beside it.
- Accessibility, contrast, reduced motion, dark and light, both densities, and the missing/failed-logo initials
  fallback all stay. The initials must never enter the score column.
- Unmatched cards keep 51's row and `PosterFallback` untouched in composition.

Everything through `theme.css` tokens; no magic values. Delete banner tokens that only existed for the old
`card-info` composition; leave the ones the new layout still uses.

## Proof

Update `tests/cards_browser.py` and `tests/matchBanner.test.ts` for the new composition. The browser suite must
assert, at 320/390/1280, both themes, both densities: no category/title/UTC text inside a matched card; the three
tiers paint in order with no collision and nothing outside the card; the initials fallback stays clear of the
scores; the single link still carries the full label; and the ratio floor. Capture before/after.

Prove the suite can fail: put `CardTiming` back into a matched card and show the "no UTC" assertion goes red.

Gate: 184+ tests, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild,
`pnpm exec wrangler deploy --dry-run`, all browser suites at both widths. `.env` says
`NUXT_PUBLIC_FEED_BASE=/api/feed`. Commit, don't deploy, don't touch `.prompts` or `DECISIONS.md`. Record the
composition and measurements in `docs/redesign-58.md`.

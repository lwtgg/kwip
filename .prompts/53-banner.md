# Task 53 — The banner is the artwork

The owner's mockups replace the provider thumbnail with a two-team banner: gradient, both logos, `vs` or the
live score, status column, progress bar. Task 52 delivers the data (`match`, rule 25); this renders it and
stops fetching the provider thumbnail. Read `docs/redesign-52.md`, `DECISIONS.md` 24 and 26 and the 51 record
`docs/redesign-51.md` first.

Branch `task/53-banner` off `main`, after 52 is merged.

## What changes

- `StreamCard.vue` stops reading `poster` and `blurhash`. The plate becomes a banner component fed by
  `stream.match`: away gradient left, home right, away logo outside-left, away score, status, home score,
  home logo outside-right.
- No match, always a valid row: keep 51's plate + identity + lane exactly, with the gradient and a monogram
  from `PosterFallback`. A match with no logos is a match: gradient and scores, initials where a logo is
  missing.
- The hero (`scale="hero"`) gets the same banner at detail scale, and the info card keeps its current facts.
- The progress bar moves into the banner and its fill comes from the match window, not a fixed width.
- `sameAs`-style details: the accessible name must carry the score, e.g. `Colorado State Rams 50, Arizona
  Wildcats 97, Halftime, 62 viewers`. The visible banner is `aria-hidden` where the name already says it.

## Rules that must not slip

- Only the score numerals are heavy; labels, abbreviations, state and viewers stay quiet 400.
- White banner text at full strength; prove ≥ 4.5:1 on every pairing in both themes with `cards_contrast.ts`
  extended, including the muted unplayed pair (`#192f23 → #361f24`).
- The card is still exactly one link; the banner adds no nested interactive element.
- 51's floors hold: ≥ 3.5:1 row at 320 and 390, the kickoff never breaks at 200 % text, no horizontal
  overflow, no truncated league label.
- The status line never wraps mid-word; `Final` and `Halftime` must fit at 320 without shrinking the target.
- Missing score in `pre` renders `vs` lowercase, as the mockup's thumbnail does.

## Tests

Extend `tests/cards_browser.py`: a matched live fixture, a matched `pre` fixture, a match with one logo
missing, a match with a bad colour, and a match with no colour; assert the banner geometry at 320/390/1280,
that the scores are the only heavy text, that the row ratio floor still holds, and that the gradient's two
end colours are the team colours. Unit-test the colour mix in `tests/`.

## Gate

`pnpm test`, both builds, default rebuild, dry-run, and all six browser suites at both widths. Report the
before/after row heights and ratios, the contrast worst pair, and the client-JS delta. Commit when green.
Do not deploy, do not touch `.prompts` or `DECISIONS.md`.

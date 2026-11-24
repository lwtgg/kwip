# Task 49a: audit the Apple Sports direction

The owner rejects the current look and names the reference: **Apple Sports on iOS, rebuilt as a website.**
Before code, produce the audit and the plan. Read `PRODUCT.md`, `docs/redesign-45a.md`, `DECISIONS.md` rules
12, 22 and 23, and the current surfaces.

Read skills first: `impeccable`, `web-design-guidelines`, `kwip-conventions`, `frontend-design`. `impeccable`
owns direction-critique; do not load `taste-skill` as well.

## Study the reference honestly

Apple Sports, from public material: Apple's February 2024 press release, Lickability's design critique, Six
Colors' comparison with ESPN, App Store copy and its accessibility list, and any screenshots you can reach.
Derive the pattern, not the pixel:

- score-forward cards with both crests and a huge compact-numeral score at the centre;
- team-colour tinting per card, muted under the text;
- favourites decide what the top of the screen holds;
- game sheet with dense box score, play-by-play, lineup and stats behind a tap;
- minimal chrome, no onboarding, controls that arrive only at a game, vibrant label stacking over tinted art;
- accessibility listed as supported: not colour alone, sufficient contrast, reduced motion.

## Then say what survives contact with a website

Our differences are real and must be stated plainly: no native chrome or sheets, no Live Activities, no
favourites store in v1, no scores from our feed yet, ad-supported with a banner that must stay below the
player, every event is a link out rather than a game we host, and the directory must still serve a date-strip
that an app does not need.

Deliver:

1. A finding list against today's surfaces, scored the way 45a did, naming exactly what makes the current
   build feel wrong next to the reference.
2. The translated pattern: what a score-forward card becomes when the score is absent but the time is known,
   how tinting is derived without team-colour data, where favourites-like ranking comes from (live, then
   next up), and how the game-sheet density maps to our event page and player.
3. A page inventory: home, category, event/player, `/vods`, replay, stale, empty, error, and the two themes,
   each with the intended treatment.
4. A constraint table: contrast for tinted text, CLS with tinted art and numerals, the banner slot position,
   density switch staying spacing-only, reduced motion, focus.
5. Two or three options where a judgement call is real, with a recommendation and the reason.

Write `docs/redesign-49a.md` and update `PRODUCT.md` where the positioning sharpens. Tokens and systems plus
the Touchline palette stay unless the audit argues otherwise and says why the change is worth it. No code
beyond docs. Report the critique score and the open questions.

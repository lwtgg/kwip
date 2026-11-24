# Review: the Apple Sports audit (49a)

Review `docs/redesign-49a.md` and the `PRODUCT.md` change on `task/49a-sports-audit`. Docs only; do not edit.
The owner asked for the Apple Sports direction, so judge whether the document earns it.

1. **Does it actually describe the reference?** Check each claim about the app against the sources it cites.
   Flag anything asserted about Apple's UI without evidence, and anything cited then overstated.
2. **Is the translation honest?** We have no scores, no opponents, no favourites. Confirm the document never
   implies data it lacks — especially that a "time-and-availability card" is a real answer to "copy Apple
   Sports" rather than a retreat, and that "no crests in v1" is argued rather than assumed.
3. **Do the recommendations hold?** Test the three choices on their own merits: intact name plus time/state
   over a symmetric three-column card; bounded poster tint over neutral; live-then-next-up over popularity.
   Say where one is wrong and what would be better.
4. **Is the work briefable?** Could an implementer build from this without guessing: card anatomy, tint
   bounds, ordering and dedupe, date-strip semantics, the event page and banner position, the states. Name
   every place it is vague.
5. **Constraints.** Contrast for tinted text, CLS with numerals and time, density staying spacing-only,
   reduced motion, focus, no-JavaScript, ad blocker, tokens only, no dependency. Verify the palette values
   match `theme.css`, not an older document.
6. **Scope discipline.** No code, no new decision claimed, DECISIONS.md untouched, no fake scoreboards,
   archive claims or history the feed cannot serve.
7. **PRODUCT.md.** Judge the sharpened positioning on its own: does it say what kwip is for better than
   before, without drifting from "we host nothing"?

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

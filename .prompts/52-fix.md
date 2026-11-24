# Fix — task 52, mascot aliases can publish the wrong school

One defect from review at `scripts/scoreboard.mjs:97`, and it is the one that matters most: a wrong score is
worse than no score.

`aliases()` treats `team.name` — the mascot — as a complete identity, equal to `displayName`. Against the live
college scoreboard a fixture named `Wildcats vs. Rams` matched Arizona Wildcats–Colorado State Rams and
published 96–83; either side alone cannot identify a school, and nearest-date did not resolve it.

Fix it in two parts:

1. **Alias strength.** Score each alias: `displayName` 3, `shortDisplayName` 2, `team.name` 1. A side's
   strength is the best tier it actually matched on, and an event only qualifies when
   `Math.min(awayStrength, homeStrength) >= 2` — so a mascot-only match never carries a score on its own.
2. **Uniqueness for the tier.** Even at tier 2, count how many distinct teams in the loaded payload carry
   that normalised alias; if it is more than one, that side drops back a tier and is re-evaluated. Count once
   per payload, not per event.
3. **Ordering.** Rank candidates by alias strength descending, then distance ascending, so a full-name match
   on a slightly further date beats a weaker match on a nearer one. Keep the one-competition-one-event rule.

Add tests: the `Wildcats vs. Rams` case must go unmatched (or match only if both sides uniquely resolve);
a full-name fixture in the same payload must still match the same competition; a duplicate short name across
two teams must not match; a strong match must beat a weaker nearer one.

Gate: full suite, both builds, default rebuild, dry-run. Report the new case both ways. Commit, do not deploy,
do not touch `.prompts` or `DECISIONS.md`.

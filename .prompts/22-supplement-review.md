# Review: task 22 supplement

Review the uncommitted diff against `.prompts/22-strmfree-supplement.md`. Do not edit files. Verdict plus numbered defects.

Load `.agents/skills/requesting-code-review/SKILL.md` and `.agents/skills/kwip-conventions/SKILL.md` first.

The brief pins a state machine and strict matching on purpose, because nine rounds were spent reinventing one last task. Judge conformance to it, not just whether it works.

## Check in this order

1. **State machine conformance.** `idle → loading → merged | none | error`, terminal until the help row's "Reload player" resets to `idle`. Flag any extra transition, any trigger that fires while `loading`, and anything that lets `none` or `error` retry by itself.
2. **Eligibility.** Only live events with `ends_at` ahead, and not when `?source=` names a supplement. Check the `?source=` case is actually implemented, not just documented.
3. **Matching strictness.** Two team tokens, order-insensitive, after the stated normalisation; `match_timestamp` within 3h of `starts_at`; the category table used only as a tiebreak and never to match a team-less event. Try to construct a wrong match: same two teams a day apart, one shared token, reversed fixture, a team name with an accent and punctuation, a club suffix.
4. **Host whitelist.** Only `strmfree.st`, `streamfree.top`, `strmfree.pk` suffixes. Check a lookalike such as `strmfree.st.evil.com`.
5. **Ordering and flags.** `4K, FHD, HD, SD`, then `live` desc, then original order; `default: false`; `origin: 'supplement'`. Check dedupe runs after the append.
6. **Caching.** `sessionStorage` per event, 10-minute window, written only on `merged`, never on `none`/`error`. Check a corrupted or JSON-broken entry is tolerated rather than throwing.
7. **Picker and copy.** `2nd` marker, the aria-label suffix, the muted treatment for `live: false`, still selectable, no height shift at `sm` and below.
8. **Failover.** A supplement 404 advancing to the next source; the URL rules from task 21 unchanged.
9. **Rules.** Browser fetch only, no dependency, no `server/**` or `nuxt.config.ts` change, no `useFeedFreshness.ts` or `PlayerFrame.vue` change. Fixture changes are allowed but must be justified.

## Also

- The builder noted a CORS/opaque-response caveat: a 404 from their API cannot be observed from the browser. Judge whether `error` handles that honestly or silently treats a 404 as `none`.
- Is one extra request per live detail page acceptable under `kwip-budgets`, given the 10-minute cache?

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`, then the answer on the budget question.

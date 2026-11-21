# Review: PitSport as a third source (task 43)

Review branch `task/43-pitsport` against `.prompts/43-pitsport.md`. Do not edit files. Verdict plus
numbered defects.

1. **Matching is by slug, not guesswork.** No `programId` is constructed; resolution uses the fetched
   catalogue and the existing window/rules. Check what happens when two catalogue slugs tie.
2. **Variant collapse.** `-hd-spanish`, `-hd-portuguese`, `-hd-multiview` and the base program become
   sources of one event, not four events; the label carries the language, the band comes from the label.
3. **No duplicates, no reordering.** A PitSport URL that already exists as a primary or a supplement is
   not added twice; existing sources keep their order.
4. **Failure is inert.** One bounded GET, no retry, and the payload is unchanged when the catalogue is
   down or unparsable.
5. **Low coverage is harmless.** Seven matches out of 110 events must not change anything for the other
   103, and the publisher must not spend probe slots on them when they do not exist.
6. **Registry rows are earned.** `pitsport.st` and `embdlol.st` markers must be real and specific to a
   working player, not generic strings a blocked page also returns.
7. **Client shape.** `origin: 'pitsport'` is handled wherever `'supplement'` is, labels and chips behave,
   nothing new is fetched client-side.
8. **No scope creep.** No dependency, no proxy, no cache-key or TTL change, no ad change.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

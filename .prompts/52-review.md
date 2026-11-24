# Review — task 52, score enrichment

Branch `task/52-scores`, HEAD `204c2f6`. Read `.prompts/52-scores.md`, `DECISIONS.md` 24–25 and
`docs/redesign-52.md`. Review the diff, then prove it by running it. Do not edit files.

Check, at minimum:

1. **Contract** — `match` survives compaction (`streamFields`), validation rejects exactly what the brief
   lists and nothing the brief allows, the fixture feed still validates and renders, `poster`/`blurhash`
   unchanged for the UI task.
2. **Sides** — away/home always from `homeAway`, including a competition where our fixture name order is
   the reverse, and one where it matches. Prove both with a real league response.
3. **Matching soundness** — both sides required, the 36 h window, one competition used once, ambiguity
   resolved by nearest date, and normalisation not over-merging (e.g. two clubs whose names differ only by
   an affix, "United" suffix collisions).
4. **Failure behaviour** — non-200, unparseable JSON, timeout and a league missing from the response all
   leave items untouched and the run succeeding; the deadline slice is inside the existing budget and
   cannot eat the pack.
5. **Budget** — one request per distinct league actually present, cap honoured, `providerRequests` counted,
   nothing added on a run with no scoreable leagues.
6. **Correctness of the values** — colour normalised to `#rrggbb`, score null in `pre`, non-integer dropped,
   `detail` shaped for `in`/`post`/halftime/OT and capped.
7. **Tests** — do they actually fail on a broken implementation? Try to break one and say which.

Also run a real end-to-end dry run of the collector against the live feed if it is cheap, and show that a
matched item carries sane values. Verdict on the above, then any defect as `path:line` with the measurement or
response that proves it. Reply exactly `VERDICT: pass|fail` first.

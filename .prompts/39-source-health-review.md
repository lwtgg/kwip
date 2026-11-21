# Review: source health probe (task 39)

Review branch `task/39-source-health` against `.prompts/39-source-health-probe.md`. Do not edit files.
Verdict plus numbered defects.

Read `verification-before-completion`, `workers-best-practices` and `kwip-budgets` first.

## Check

1. **Unknown health is inert.** Missing, unparsable, stale or empty `health.json` must leave order and
   markup exactly as before; no 404, no `snapshotUnavailable`, no error surfaced. Confirm the health
   read cannot make a page slower or fail.
2. **Ranking cannot jump a band.** A degraded source may only move within its quality and locale peers,
   never above a better quality or a better locale, and stays selectable and linked when selected.
3. **The probe is bounded and honest.** 3 s per hop, 2 per host, 40 per run, one failing source never
   fails the snapshot, no probe for 24/7 or out-of-window events, and a 200 without markers is not
   `embedOk: true`. Check what a frozen sequence and a marker-less 200 actually store.
4. **Registry as data.** Adding a host is a row; unknown hosts are unprobed, never assumed healthy.
5. **The transport.** `health.json` rides the existing snapshot payload with its own endpoint entry and
   is keyed by `sourceKey`; a generation's health cannot be paired with another generation's sources.
   Judge the client fetch: is `/api/source-health` correctly scoped, keyed and cached, and does it
   re-run when the generation changes?
6. **No scope creep.** No new dependency, no proxy, no `<video>`, feed payloads unmodified, no cache-key
   or TTL change, ad path untouched.
7. Tests: registry matching, the empty-markers 200, 404, frozen and advancing sequences, band-preserving
   tiebreak, and the inert-when-absent case.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

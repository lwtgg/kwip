# Review — task 56, generation-first feed

Branch `task/56-generation-first`, HEAD `6de343b`, plus `.prompts/56-note.md` for the corrected diagnosis.
Read the brief, `DECISIONS.md` 11, 19, 20 and `docs/verification-56.md`. Review the diff, then prove it. Do
not edit.

The defect this must close: after hydration the client refetched `api.ppv.st` and replaced server data, so
`match` disappeared from a page that had it. Check, at minimum:

1. **Downgrade is impossible.** With a matched live event, `match` is present in the SSR payload, still
   present after hydration, and still present after a client refresh and after 90 s. Show the payload probe.
2. **The client's only feed origin is the route.** No client request goes to `api.ppv.st` for a normal page;
   prove it from the network log, and prove `ping` still goes upstream.
3. **Rule 20.** A path missing from a readable generation is 404 and is *not* back-filled from the provider;
   an unreadable manifest proxies instead. Both directions tested.
4. **Rule 11.** The cache key carries the generation and the host and nothing else; an old generation's entry
   cannot answer for a new one; nothing with `Set-Cookie`/`Vary` is stored.
5. **Fallback intact.** Generation → provider → mirror → seed, in that order, each stage reachable when the
   one before it fails. Say how you forced each.
6. **Correctness of the route.** Path validation, traversal, encoding, `HEAD`, and that it never renders
   HTML. Host token replacement still applies.
7. **Tests.** Do they fail on a broken implementation? Break the client-origin guarantee and say what fails.

Verdict on all of it, then defects as `path:line` with the probe or log that proves them. Reply exactly
`VERDICT: pass|fail` first.

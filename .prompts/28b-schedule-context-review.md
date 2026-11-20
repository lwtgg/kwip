# Review: schedule-context fix

Narrow review of the uncommitted diff. Do not edit files. Verdict plus numbered defects.

A live rehearsal found that on a `schedule` event `inputs` is empty, so `inputs.simulate` is `null`:

- the `refresh` job guard `(inputs.simulate == '' || inputs.simulate == 'none')` is false for `null`, so every scheduled run would skip the publish;
- the alert side's simulation condition is true for `null`, so a scheduled run takes simulation paths with empty outputs, sets `SIMULATED`, prefers those empties over `needs.refresh`, and cannot close an incident.

The builder was asked to treat absent inputs as `none`, give the alert path one source of truth for its inputs, and add a no-input fixture.

## Check

1. Resolve the inputs once, from wherever they come, with absent values normalised to `none`. Prove there is no remaining place where a `null` input changes a branch.
2. A scheduled run must execute `refresh` and must behave identically to a bare manual run with `none`.
3. A healthy no-input run must still close an open incident; a no-input run must not emit simulated markers.
4. The four existing simulation shapes still work and are still marked simulated.
5. The no-input test asserts the job actually runs, not just that a string compares.
6. Nothing else in the workflow regressed: permissions, concurrency, timeouts, secret handling.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

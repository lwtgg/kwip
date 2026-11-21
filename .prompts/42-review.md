# Review: settle the host list (task 42)

Review branch `task/42-settle-host-list` against `.prompts/42-settle-host-list.md`. Do not edit files.
Verdict plus numbered defects.

1. **Evidence, not vibes.** Each verdict has a status/header/body quote, a date and a resolver or network
   path; anything unverified is marked unverified.
2. **Death is not assumed.** embed.st is only called dead if a second resolver agrees, and no successor is
   claimed without a link to it.
3. **Registry hygiene.** Rows exist only for alive and framable hosts, and a host that needs an upstream id
   list is marked as such rather than added unused. The embed.st removal is correct and does not orphan a
   reader path.
4. **No scope creep.** No provider integration, no dependency, no deploy, ad flag untouched; tests and both
   builds still pass.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

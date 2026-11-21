# Review: ingress logging and the render ceiling (task 38)

Review the uncommitted work on branch `task/38-504` against `.prompts/38-504-investigation.md`. Do not
edit files. Verdict plus numbered defects.

Read `verification-before-completion`, `workers-best-practices` and `kwip-budgets` first.

Context you can rely on: the 504s are now explained and are not user-facing. Every one in the last 24 h
is `requestSource: edgeWorkerCacheAPI` — Cloudflare's internal record of a `caches.default.match()` miss
(and the paired PUT 204s are `cache.put`). So the logging and the ceiling are the deliverable, not a fix.

## Check

1. **No behavioural change on the healthy path.** Same responses, same headers, same cache keys and
   TTLs, same 404s, same `snapshotUnavailable`, no entry written for a cancelled render. Diff the
   before/after behaviour, not the prose.
2. **The ceiling is a ceiling.** One deadline around cache lookup plus render, not per hop; the
   fallback order is cache, seed, then the 503 retry page; it fires at 8 s and cannot fire on a fast
   path; a released late render must not write cache; `waitUntil` still works.
3. **The renderer replacement is sound.** `nitro:config` alias plus `server/handlers/page-renderer.ts`
   must not lose Nitro's renderer options or break `NITRO_PRESET=node-server`; check both presets build.
4. **Logging cost.** One line per page request plus boundary lines, no string work on non-page paths,
   no payloads, no user identifiers beyond what is already public. Ray present so a line is matchable.
5. **Cloudflare correctness.** Nothing that relies on `setTimeout` firing during streaming, no
   `caches.default` in the Node preset, no new binding or dependency.
6. Tests cover the fallback order, the no-write-after-cancel rule, and the healthy miss/hit pair.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

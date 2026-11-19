# Review: task 24 R2 reader

Review the uncommitted diff against `.prompts/24-read-snapshots.md`. Do not edit files. Verdict plus numbered defects.

Load `.agents/skills/requesting-code-review/SKILL.md` and `.agents/skills/workers-best-practices/SKILL.md` first. Read `docs/freshness-design.md` "Reader and adapter".

## The headline problem

Measured on a preview Worker, the builder reports **101 ms p50 / 228 ms p95 on the largest listing**, 30 ms / 65 ms on the largest detail, 17 ms / 35 ms on the sitemap, and **14 HTTP 503s out of 30 on the listing**. Free CPU is 10 ms. Every route is over, the listing by an order of magnitude.

The brief said: if a path breaches the budget, say so and stop rather than shipping. It shipped. So:

1. Is the measurement trustworthy? Say how a local `wrangler dev` CPU number relates to a deployed Free CPU number, and whether these numbers can even be believed. If they can, the listing needs a plan, not a note.
2. Where does the CPU actually go? Identify the specific costs in the path — manifest parse per request, JSON parse of a large payload, host substitution, rendering — and rank them. Propose the cheapest fixes: an isolate-scoped parsed-manifest cache, avoiding re-parsing a list payload per request, trimming what SSR serialises, or caching the rendered listing.
3. Does the 503 actually mean CPU abort, and does the code degrade sanely when it happens?

## Then conformance, in this order

4. **Generation pinning.** One manifest read per request, memoised, shared across parallel consumers. Nothing may read the manifest twice or straddle generations.
5. **Validation.** `schema === 1`, `commitId` regex, `payloadKey === snapshots/<commitId>.bin`, contiguous offsets, `offset + length === size`, exactly one entry per path, timestamps parse. Check each rule separately and that a failing manifest is rejected before any payload is trusted.
6. **Omission is authoritative.** A path missing from a valid manifest renders the normal unavailable state and is *not* back-filled from the seed.
7. **Whole-response seed retry.** Only when the generation is unreadable; retried before any payload is serialised; never per endpoint. A second failure renders a mountable unavailable page.
8. **Sitemap.** Same reader, omits unavailable entries, empty but valid output allowed.
9. **Freshness untouched.** `useFeedFreshness.ts` unchanged, origin timestamp preserved on an unchanged manifest.
10. **Scope.** Fixtures, `ping` and the unbound Node path unchanged; `ASSETS` still present; no runtime dependency; `app/**` only where unavoidable.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`, then a short ordered "cut the CPU" list.

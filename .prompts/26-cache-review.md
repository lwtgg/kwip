# Review: task 26 edge HTML cache

Review the uncommitted diff against `.prompts/26-edge-cache.md`. Do not edit files. Verdict plus numbered defects.

Load `.agents/skills/requesting-code-review/SKILL.md` first.

Builder reports hit CPU of 1–2 ms p50 on every route, all 240 preview requests 200, and 120 hit bodies byte-identical to their miss. Misses stay at 146 ms p50 on the listing, which Paid now absorbs.

## Check in this order

1. **Key composition.** Origin and pathname, then generation (`commitId` or literal `seed`), then host, then only `filter` and `source` normalised and sorted. Prove no volatile parameter can enter the key, and that generation and seed can never collide.
2. **Generation cannot be skipped.** The key must come from a validated manifest read. Check no timestamp, TTL, or bare ETag substitutes for `commitId`.
3. **Store rules.** `GET` only; `200` only; `text/html` or `application/xml` only; no `Set-Cookie`. Prove an unavailable page, a 4xx, a 5xx and a seed-on-error response cannot be stored under a generation key. Prove the write is in `waitUntil`.
4. **Cap on the entry's life.** 15-minute TTL is actually applied to the stored response, not just documented.
5. **Absence.** `caches.default` missing (local `wrangler dev`, unbound Node) means silent no-op: no header, no throw, unchanged rendering.
6. **Cookie variants.** The builder says theme and density cookies bypass shared caching because SSR serialises those preferences. Verify the bypass decision is taken on the *request* before lookup, that a bypass response is also not stored, and that a cached variant cannot be served to a request with different cookies.
7. **Canonical host.** The alternate hostname must redirect before any lookup, so a mirror never warms a canonical key with mirror HTML, and never serves canonical HTML under the mirror.
8. **Scope.** Listing, category, details and sitemap cached; `robots.txt` not. Nothing user-specific cached.
9. **No new failure mode.** A cache read or write throw must not take the page down. Check the error path honestly — a swallowed `match` failure is fine, a swallowed render is not.
10. **Budget and bundle.** No new dependency, no binding. Judge the +1.56 KiB upload.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

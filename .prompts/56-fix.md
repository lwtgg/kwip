# Fix — task 56, three from review

`/tmp/56-review2.log`. Two behaviour defects and a test that cannot see them.

1. **Age must not demote a readable generation** (`server/utils/feed.ts:460`). At 46 minutes the same packed
   bytes were served from the provider, losing every `match` and back-filling omissions — rules 19 and 20.
   A readable generation always wins, however old; its shape is authoritative. Age only feeds the existing
   stale state and notice, and stays a trigger for a refresh, never for a different source. Keep the provider
   and mirror reachable for the unreadable case only.
2. **HEAD 404s on an existing endpoint** (`server/routes/api/feed/[...path].get.ts:3`). Handle HEAD on the same
   route: same status and same validation as GET, `no-store`, no body.
3. **The browser test passes after hydration loses `match`** (`tests/generation_first_browser.py:84`). It
   asserts a separate API response instead of client state. Assert the hydrated payload on the page holds the
   score, force a refresh through the route, and re-assert after it; then wait past the 60 s bucket and assert
   again. Prove it by intercepting the refresh and stripping `match` — the test must fail.

Gate: full suite, both builds, default rebuild, dry-run, all six browser suites at both widths, and the age
probe at 1 minute and 46 minutes showing identical bytes, identical statuses and `match` retained at both.
Commit, don't deploy, don't touch `.prompts` or `DECISIONS.md`.

# Review — task 57, build identity in the HTML cache key

`48898f8` on `task/57-build-key`. Read `ROADMAP.md` "Defect found 2026-11-24 — a deploy leaves cached HTML
pointing at dead assets" and `docs/verification-57.md`, then trust nothing in the doc without reproducing it.

The claim: cached HTML used to survive a deploy and point at `/_nuxt/entry.<old>.css`, which 404s, leaving the
page unstyled for up to 15 minutes. The fix puts `runtimeConfig.app.buildId` in the edge key.

Prove or break:

1. **The defect is real and the fix closes it.** Repeat their Wrangler harness yourself: warm the cache, build
   again with a different build id and a different `entry.*` hash, request again. Old code: `hit` naming a dead
   hash. New code: `miss`, a live hash, then `hit` on the same live hash. If the harness can't distinguish the
   two, say so.
2. **`app.buildId` actually exists in the deployed runtime shape**, not only under `wrangler dev` and not only
   at build time. A missing or stripped `app` degrades to an omission — decide whether that is safe or whether
   the omission collides with a previous version's key. Check the unit test covers omitted vs empty vs a real id.
3. **Sitemap and every other cached page** (`/`, `/live/*`, `/c/*`, `/vods/*`, `sitemap.xml`) still cache and
   hit under an unchanged build. Any path that stops caching because of the new parameter is a regression.
4. **The TTL and freshness rules are untouched** — `edgeCacheMaxAge`, `isEdgeCacheable`, the absolute deadline,
   the `cacheIdentity` recheck at store time, and personalisation (`theme`/`density` cookies still skip the
   cache). A build-id mismatch at store time is impossible within one process; confirm they didn't add a
   redundant or wrong check.
5. **No key growth or collision:** parameter order/normalisation, two distinct build ids, and the same id with
   different host/generation/query.
6. The full gate with your own builds, and the browser suites at both widths, plus the new `build_key_worker.py`.

Reply exactly `VERDICT: pass|fail`, then findings as `path:line` with reproduced evidence. No edits.

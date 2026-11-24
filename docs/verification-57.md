# Task 57: build-aware HTML cache keys

The key now includes `useRuntimeConfig(event).app.buildId` as a separate `build`
search parameter. Lookup reads runtime config once. Missing/null IDs omit that
parameter, so they cannot collide with any string ID (including an empty string).
Generation, host, render-query normalization and TTL rules are unchanged.

## Reproduction and mutation

`tests/build_key_worker.py` builds twice, seeds a fixed generation into local R2,
and runs real Wrangler `caches.default` against `/vods` at the same origin with
one persistent local state directory. It warms to a hit before stopping Wrangler.
The second build adds an unused CSS custom property in the theme token file to
force a different entry hash, then restarts Wrangler. A `finally` restores the
source file. Every build completes before Wrangler starts; Wrangler and its
children exit before the next build starts. No remote R2 or deployment is used.
The harness also checks that the two build IDs differ and that the old asset no
longer exists after rebuilding. Raw HTML, headers and build/Worker logs are saved
under `--artifacts`.

Commands (from repository root):

```sh
# Original code, before the fix:
python3 tests/build_key_worker.py --expect-broken \
  --artifacts /tmp/kwip57-reproduce --baseline /tmp/kwip57-baseline/.output
# Fixed code:
node --test tests/edgeCache.test.ts
python3 tests/build_key_worker.py --artifacts /tmp/kwip57-fixed
# Mutation: remove only the line setting the build search parameter:
# if (buildId !== undefined && buildId !== null) key.searchParams.set('build', buildId)
node --test tests/edgeCache.test.ts
python3 tests/build_key_worker.py --expect-broken --artifacts /tmp/kwip57-mutation
# Restore that line after the negative control.
```

The original run produced `miss`, then `hit`, naming `entry.CE3iXlqq.css`.
After the second build it returned `hit` twice, still naming that file although
it was absent from `.output/public/_nuxt`. The negative-control assertion passed:
this is precisely the broken response the positive assertion rejects.

The fixed run used build IDs `5b6fd82b-fa0d-4e51-a707-773cee28ad98` and
`74e628f2-b22d-4c27-9aad-341c6e0a9b31`:

| Request | Observed `x-kwip-cache` | CSS in served HTML | File exists |
| --- | --- | --- | --- |
| First build, warm | `miss` | `entry.CE3iXlqq.css` | yes |
| First build, repeat | `hit` | `entry.CE3iXlqq.css` | yes |
| Second build, same URL | `miss` | `entry.C7jFT_z8.css` | yes |
| Second build, repeat | `hit` | `entry.C7jFT_z8.css` | yes |

The mutation run used build IDs `5324741b-0c4f-43e5-9fec-0cd35d1d825f` and
`fc62c78e-f5f0-430b-a768-35f8c83ab583`. Its second-build and repeat responses
both had `x-kwip-cache: hit`, naming dead `entry.CE3iXlqq.css` instead of the
new `entry.C7jFT_z8.css`. The unit mutation also failed (2 failures, including
the explicit unequal-build assertion). The implementation was restored.

Unit coverage includes equal/different builds, host and generation separation,
render-query normalization, URL encoding of the build parameter, and missing
IDs versus empty, literal `undefined`, literal `null`, and normal build strings.

## Final gate

`.env` remains `NUXT_PUBLIC_FEED_BASE=/api/feed`. For the existing fallback
browser scenarios, the ignored `public/feed-cache` seed was copied from the
prior task's local `/tmp/kwip56-fix-final-output/public/feed-cache` archive.
No credentials or remote feed reads were needed to prepare it. It is not part
of this commit. The reproduction used its own fixed fixture generation in local
R2, independent of that seed.

```sh
pnpm test
pnpm build
NITRO_PRESET=node-server pnpm build
pnpm build
pnpm exec wrangler deploy --dry-run
# Recheck the final handler and the strengthened build-ID assertion:
python3 tests/build_key_worker.py --artifacts /tmp/kwip57-final-proof
# Restore normal CSS in the final output after the proof's temporary token:
pnpm build
pnpm exec wrangler deploy --dry-run

/tmp/kwip50a-venv/bin/python tests/density_browser.py .output
/tmp/kwip50a-venv/bin/python tests/click_under_browser.py /tmp/kwip57-baseline/.output .output
/tmp/kwip50a-venv/bin/python tests/banner_browser.py .output
/tmp/kwip50a-venv/bin/python tests/notLive_browser.py .output
/tmp/kwip50a-venv/bin/python tests/sourceHealth_browser.py .output
/tmp/kwip50a-venv/bin/python tests/cards_browser.py .output --screenshots /tmp/kwip57-shots
```

The full suite passed: **184 tests, zero failures**. Both build presets, the
normal default rebuild, and both dry runs exited zero. The final two-build proof
used build IDs `037255f9-eff6-42aa-8d38-32b98e5fde46` and
`1025d3f0-cf23-4a2f-96c4-4cbaa46f5066`, again producing `miss` with live
`entry.C7jFT_z8.css` after rebuilding, then `hit` with the same live hash.
A separate code review found no defects and reran the five cache unit tests.
Only dry runs were performed; nothing was deployed.

All six browser suites exited zero at **390 and 1280 pixels**. Cards also
passed at 320 pixels, in both themes and densities, with fresh and stale feeds:
60 page loads recorded in `/tmp/kwip57-shots/report.json`. Source-health emitted
Playwright pending-route teardown diagnostics; its assertions completed at both
widths and its process exited zero. Browser logs are `/tmp/kwip57-{density,
click_under,banner,notLive,sourceHealth,cards}.log`.

`git diff --check` passed. No dependency or package-script changes were made.
The temporary theme token, mutation, `.prompts`, and `DECISIONS.md` are absent
from the final diff.

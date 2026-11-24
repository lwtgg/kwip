# Generation-first feed verification

Task 56 uses `/api/feed` by default, including Wrangler's runtime variable. Explicit feed bases and
`/fixtures` still work. The API and SSR share the packed snapshot reader, validation, deadlines and
host replacement. A readable generation's omitted endpoint returns JSON 404 without back-filling.
Missing, unreadable, or older-than-45-minute list verification takes the provider, network-failure
mirror, then seed path. The 45-minute threshold matches the publisher's existing freshness threshold.
Ping always uses the provider. Browser API errors remain authoritative and cannot trigger a second,
client-side mirror/seed chain. The same-origin request budget covers the route's full fallback chain.

Decision 11 explicitly keeps our `/api/*` uncached. JSON responses therefore use `no-store`; no JSON
Cache API entry is written. HTML retains the existing generation/host/render-query key, boundary TTL,
and successful-response-only cache rules. Snapshot omission and stale state, the 60-second bucket,
host tokens, fixture normalization, and ad click-under behavior remain covered.

## Production evidence

Read-only R2 GETs captured commit `20261124T085616Z-35c9aaa2`, verified at
`2026-11-24T08:58:01.926Z`: 622,751 packed bytes, 240 endpoints, 75 events with match data. The raw
manifest and packed payload were supplied unchanged to a local Worker binding adapter. The new
`tests/generation_first_browser.py` accepts such a capture without reading credentials, verifies the
SSR payload with JavaScript disabled, then checks the browser/API at 390 and 1280 pixels. It also
checks JSON content type, no-store, omitted-detail 404, and absence of browser provider API calls.

For `ucl/2026-11-24/bodo-las`, SSR and `/api/feed/streams/...` carry that exact commit and exact match:
LASK Linz away, Bodo/Glimt home, state `pre`, both scores null, with the generation's colors and logos.
The direct production provider response contains no `match`. The production HTML captured before
this change already contains snapshot provenance and match data: the prompt's server-side
`browserRefresh` diagnosis is stale because the current code already guards it with
`import.meta.client`. This task makes browser reads generation-first and enables same-origin SSR;
it does not claim a numeric score appeared for a pre-game event or that production was changed.

## Gate

- `pnpm test`: 180 passed, zero failed.
- `pnpm build`: Cloudflare Worker build passed.
- `NITRO_PRESET=node-server pnpm build`: passed; then default `pnpm build` passed again.
- `pnpm exec wrangler deploy --dry-run`: passed; no deployment performed.
- `git diff --check`: passed.
- Independent read-only code review: no remaining concrete defects. Its deadline finding was fixed.

Browser commands use `/tmp/kwip50a-venv/bin/python` and an immutable copy of the final Worker output,
so no Wrangler process reads `.output` during a build. The final guard change restores the pre-existing absolute-fixture seed fallback; it is covered by the final unit run. The live-generation browser proof was repeated against the final default rebuild. The click-under comparison uses the existing
pre-task-30 baseline `/tmp/kwip50a-baseline/.output`.

```
python tests/density_browser.py OUTPUT
python tests/click_under_browser.py BASELINE OUTPUT
python tests/banner_browser.py OUTPUT
python tests/notLive_browser.py OUTPUT
python tests/sourceHealth_browser.py OUTPUT
python tests/cards_browser.py OUTPUT --screenshots /tmp/kwip56-shots
python tests/generation_first_browser.py OUTPUT /tmp/kwip56-live
```

All six browser suites passed at 390 and 1280 pixels; cards also passed at 320 pixels across both themes, both densities, and fresh/stale states. The live-generation proof passed at both widths, including its final-rebuild rerun.

The source-health stale-seed case now explicitly ages its own temporary copied seed. It previously
relied on build input already being stale, which failed with this task's freshly captured seed.

## Budgets

Compared with a clean build of `3164f95` using identical seed input:

| Measure | Before | After |
| --- | ---: | ---: |
| Wrangler upload | 1067.40 KiB | 1072.01 KiB |
| Wrangler gzip | 280.41 KiB | 281.46 KiB |
| Server executable `.mjs` bytes | 732,074 | 734,982 |
| Server source-map bytes | 291,829 | 555,751 |
| `du -sk .output/server` | 1160 | 1424 |
| Client `_nuxt` disk size | 396K | 396K |
| Server entry | 253 bytes | 253 bytes |

The server directory exceeds the 10% disk-growth flag because of generated source maps; executable
code grows 0.4% and uploaded gzip 0.37%. No dependencies, images or client chunks were added.
Wrangler repeats the existing `ignored-bare-import` warning for the platform `node:process` shim:
15 occurrences on the baseline, 16 with the new route, same warning class and dependency. The local
pnpm hook also reports its existing ignored-workerd-build-script warning on both revisions; Wrangler
itself completes successfully. No package or lockfile changes are included.

## Changed files

- `.env.example`
- `app/composables/useFeed.ts`
- `nuxt.config.ts`
- `server/routes/api/feed/[...path].get.ts`
- `server/utils/feed-route.ts`
- `server/utils/feed.ts`
- `server/utils/snapshot.ts`
- `tests/readSnapshots.test.ts`
- `tests/sourceHealth_browser.py`
- `tests/generation_first_browser.py`
- `wrangler.toml`
- `docs/verification-56.md`

No `package.json` additions. No changes to `.prompts` or `DECISIONS.md`.

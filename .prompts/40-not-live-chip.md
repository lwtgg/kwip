# Task 40: cover the "Not live" chip in a browser suite

`SourceSelect.vue` renders a `Not live` status for any source whose `live` is `false`, and
`strmfree.ts` sets `live` from the provider's status endpoint (`liveVariants`), defaulting to `false` when
that call fails or is absent. Nothing verifies it. ROADMAP §6 has had this item blocked because no
fixture carried `live: false` and no live stream was up while it was attempted.

Do not change behaviour. This is a test-only task: prove the chip exists, proves liveness, and never
costs selectability.

Read `tests/sourceHealth_browser.py`, `tests/click_under_browser.py` (the `worker` helper and
`fixture_assets`), `app/utils/strmfree.ts`, `app/components/SourceSelect.vue`,
`app/composables/usePlayerSources.ts` and `public/fixtures/strmfree.json`.
Read `webapp-testing` and `verification-before-completion`.

## What to build

`tests/notLive_browser.py`, run as `python tests/notLive_browser.py .output`, in the same shape as the
existing suites: reuse `worker()` with the `/fixtures` feed base, one event page, intercept
`https://strmfree.pk/api/v1/streams` and `https://strmfree.pk/api/v1/sources/<key>` rather than reaching
the network, and serve your own iframes for the fetched embed URLs.

Cover, at 390 px and 1280 px:

1. **The chip appears only for the not-live variant.** Status payload with one live and one not-live
   source of equal quality: the not-live chip has accessible name `… , Not live`, the live one has no
   status in its name, and both stay in the picker.
2. **A not-live source stays selectable and linked.** Click it: the frame src becomes its embed URL,
   `aria-pressed` moves, and the chip keeps its status.
3. **Status failure is not liveness.** With `/api/v1/sources/<key>` 404ing, every supplement source
   still lists as selectable (chips `Not live`, no removal, no error surface) and the page stays 200.
4. **No chip when the provider says live for all.**

Assert too that a not-live source is never auto-selected over a live one when the detail's own first
source fails, and that no console or page errors occur.

## Verification

The suite green at both widths, plus `pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`
and `wrangler deploy --dry-run`. Keep the existing banner, click-under, source-health and density suites
green (`/tmp/pwvenv/bin/python tests/<suite>.py .output`). No dependency, no production code change, no
deploy, ad flag untouched.

Report the suite output and any behaviour you found that the chip gets wrong.

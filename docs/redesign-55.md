# Task 55 top event

The default homepage selects the highest-viewed live event with a resolved zlive embed. If no live event has one, viewer rank decides. The existing 24/7 fallback comes next, followed by the soonest scheduled kickoff and then the archive fallback. The brief asks for the existing upcoming branch and for the soonest kickoff. The default homepage follows rule 26 and the required kickoff fixture. The explicit Upcoming filter retains its existing viewer ranking.

The feed publisher projects one resolved iframe URL onto each listing item when the listing needs data from its detail. It checks primary and substream sources and the supplements admitted to that generation. The homepage still reads one listing. Older generations can use the embed data already in their listing and gain detail-only embeds on the next full refresh. The projection uses the remaining pack space after scores and source health. Zlive URLs take priority when space is tight.

The matched hero has a full-width banner link and a separate 16:9 player box. The box stays reserved when the feed has no iframe. The banner keeps the task 58 accessible name. The sound button shares the plate footer with the viewers and sits outside the link and iframe. The same space is reserved for the taifood hero. The existing ad slot follows the player, and neither mounting the frame nor using the sound control consumes the rule 22 click-under.

Visible live zlive frames start at `muted=1` and wait for an intersecting player box. Save-Data skips live autoplay. Exiting the viewport or hiding the tab removes the frame. On return, a new frame starts muted. The button replaces the frame during the tap and removes the mute query when turning sound on. Non-live zlive starts with `autoplay=0`. Taifood uses its paused default. All frames use the existing shield sandbox.

## Measurements

Chromium ran with an intercepted embed document and a local provider feed. The fixture has a 62-viewer zlive event and a 1,000-viewer taifood event. The taifood-only variant gives the selected event the same 62 viewers. Measurements are CSS pixels at an 850 px viewport height.

| Viewport | Live banner, both providers | Upcoming banner | Player, before mount, mounted and unmounted |
| --- | --- | --- | --- |
| 320 px | 288 × 144.38 | 288 × 133.81 | 288 × 162.00 |
| 390 px | 358 × 144.38 | 358 × 133.81 | 358 × 201.38 |
| 1024 px | 976 × 256.00 | 976 × 256.00 | 976 × 549.00 |
| 1280 px | 1232 × 320.00 | 1232 × 320.00 | 1232 × 693.00 |

The fixture measured zero CLS at every width. The banner filled the card width, kept the linked accessible name, and passed the task 58 grapheme, fit, and overflow checks. The sound button had a 44 px minimum target. The fixture checked the URL, sandbox, remount, focus, tab and scrolling behavior using intercepted documents. Live provider playback and bandwidth were measured separately in [the task 54 probe](top-event-probe.md). Zlive used 41.9 MB over 30 seconds, about 1.3 MB/s. Idle taifood used about 0.77 MB.

## Verification

- `pnpm test` passed 194 tests. The new fixtures cover the primary iframe, substreams, supplements, viewer rank, kickoff, query mutation, visibility, and Save-Data. Publisher and snapshot tests also verify the listing projection.
- `pnpm build`, `NITRO_PRESET=node-server pnpm build`, the default rebuild, and `pnpm exec wrangler deploy --dry-run` passed with `NUXT_PUBLIC_FEED_BASE=/api/feed` in `.env`. The dry-run upload was 1,029.71 KiB, or 274.78 KiB gzipped. The previous gate measured 1,025.30 KiB, or 273.13 KiB gzipped. Wrangler repeated the baseline's Cloudflare preset warnings about side-effect-free `node:process` imports.
- `tests/build_key_worker.py` verified a cache miss after rebuilding and a cache hit on the next request, both with live CSS. `node tests/cards_contrast.ts` checked 1,224 banner cases with a minimum model contrast of 4.55:1.
- The top-event suite passed all 16 width and fixture combinations. In a copy of the default build, removing the client call that sets `muted=1` made the suite exit 1 at 320 px. It received `https://zlive.st/embed/TSN4?quality=high` where it expected `https://zlive.st/embed/TSN4?quality=high&muted=1`.
- The cards, banner, density, not-live, click-under, generation-first, and source-health browser suites passed at their covered widths. The card sweep covered 1,152 matched listing observations and 16 matched heroes, with zero hydration or uncaught page errors and a minimum rendered contrast of 4.55:1. The generation suite used a local packed capture, the source-health suite used a temporary local seed, and click-under compared with its established baseline at `1942ccb`.
- `git diff --check` passed. Wrangler ran in dry-run mode for the release gate.

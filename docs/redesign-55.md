# Task 55 top event

The default homepage selects the highest-viewed live event with a resolved zlive embed. If no live event has one, viewer rank decides. The existing 24/7 fallback comes next, followed by the soonest scheduled kickoff and then the archive fallback. The brief asks for the existing upcoming branch and for the soonest kickoff. The default homepage follows rule 26 and the required kickoff fixture. The explicit Upcoming filter retains its existing viewer ranking.

The snapshot publisher writes `hero_embed` as an optional, validated HTTP(S) URL on the stream listing when it needs data from the detail. It resolves zlive first, then the first valid iframe, from primary and substream sources and the supplements admitted to that generation. The reader resolves embeds already present in the listing and discards invalid projections. If a generation has neither a projection nor a usable listing embed, the homepage ranks live events by viewer count and shows a banner-only hero. The projection uses remaining pack space after scores and source health, with zlive URLs first when space is tight. Zlive URLs use HTTPS and preserve the provider's path casing and any `{host}` placeholder for request-time substitution.

The hero reserves a full-bleed 16:9 player box when it has an embed. The matched banner keeps its accessible link name, scores, status, and detail. When there is a player, the audience moves to a wrapping footer alongside the sound control. The footer sits outside the event link and provider frame. The existing ad slot follows the hero. Mounting the frame and using the sound control leave the rule 22 click-under available.

Visible live zlive frames start at `muted=1` when their player box intersects the viewport. With Save-Data, live and non-live zlive wait for **Play**. The first tap permits mounting muted for the visit. **Sound on** and **Mute** then replace the iframe while preserving button focus. Exiting the viewport or hiding the tab removes the frame. On return the frame starts muted and the button retains focus. Non-live zlive uses `autoplay=0`. Taifood uses its paused default, including under Save-Data. The hero applies the shield sandbox to zlive only.

## Measurements

Chromium used an intercepted embed document and a local provider feed. The fixture gives the featured event 62 viewers and its live competitor 1,000 viewers. The taifood-only and no-embed fixtures put the 62-viewer event first by viewer count. These measurements are CSS pixels at 100% root text and an 850 px viewport height.

| Viewport | Live zlive plate | Live taifood plate | Upcoming zlive plate | Reserved player |
| --- | --- | --- | --- | --- |
| 320 px | 288 × 160.38 | 288 × 134.38 | 288 × 156.00 | 288 × 162.00 |
| 390 px | 358 × 160.38 | 358 × 134.38 | 358 × 157.50 | 358 × 201.38 |
| 1024 px | 976 × 316.00 | 976 × 290.00 | 976 × 316.00 | 976 × 549.00 |
| 1280 px | 1232 × 380.00 | 1232 × 354.00 | 1232 × 380.00 | 1232 × 693.00 |

At 320 and 390 px with 200% root text, the footer wraps. The zoom cases use a taller viewport to exercise playback after the larger text moves the player down. The fixture checks the viewer text and button rectangles for overlap and measures a minimum 44 × 44 px button. It also checks that switching between Play, Sound on, and Mute keeps the button and reserved player in place. All mounted and remounted hero fixtures measured zero CLS. Live provider playback and bandwidth were measured separately in [the task 54 probe](top-event-probe.md). Zlive used 41.9 MB over 30 seconds, about 1.3 MB/s. Idle taifood used about 0.77 MB.

## Verification

- `pnpm test` passed 198 tests, including the reader and publisher regressions, zlive URL normalization, and host placeholder preservation.
- The default Cloudflare build, `NITRO_PRESET=node-server pnpm build`, the default rebuild, and `pnpm exec wrangler deploy --dry-run` passed. Wrangler reported 1,032.07 KiB total and 275.48 KiB gzipped, with the baseline's 16 `node:process` side-effect warnings.
- `tests/build_key_worker.py` verified a cache miss after rebuilding followed by a hit, both serving live CSS. `node tests/cards_contrast.ts` checked 1,224 banner cases at a minimum model contrast of 4.55:1.
- The top-event suite passed 36 cases at 320, 390, 1024, and 1280 px, including four cases at 200% root text. It checked no-embed height, footer geometry, the Save-Data hold, focus across tab visibility, the sandbox, and stable player dimensions.
- The cards, banner, density, not-live, click-under, source-health, and generation-first browser checks passed at all four widths. The gate extended the width loops locally where needed. The card sweep checked 1,152 matched listing observations and 16 matched heroes, with zero hydration or uncaught page errors and a minimum rendered contrast of 4.55:1. Source health used a local seed, generation-first used an archived R2 capture, and click-under used the established `1942ccb` baseline.
- `git diff --check` passed.

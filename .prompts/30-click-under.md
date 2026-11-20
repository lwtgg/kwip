# Task 30: our own click-under, from our own chrome

Direction is settled: the revenue shape is our own click-under plus reserved banner slots. This brief is the click-under only; the slots follow as task 31 and must not be mixed into this diff.

The research (task 28) found the embed we frame already fires a popunder on the first player click, through `aclib` and a full-viewport click catcher, billed to the provider. So v1 is not ad-free. Our click-under replaces that on the click we own and is the highest-value single mechanism the research measured.

## Shape

1. **One click-under per session.** The first qualifying click on a source button opens the advertiser in a new tab and the stream still loads in ours. Later clicks in the same session do not.
2. **Eligibility.** Qualifying means a click on a source chip or the primary play action on a live or upcoming timed event. Not 24/7 channels, not internal navigation, not the second click of the same already-selected chip.
3. **Same gesture.** Call `window.open` synchronously inside the click handler, before any `await`, so no popup blocker eats it. Set `noopener` and `noreferrer` on the opened window.
4. **Routed through us.** Open `/go/<placement>` on our own origin, not the network's URL directly, and let the Worker 302 to the destination. Destination, network and the on/off flag must all be changeable without a redeploy of the page.
5. **Never in the way.** The stream must load whether or not the tab opens, whether or not the ad request returns, and with an ad blocker on. No layout, no shift, no consent wall.
6. **Labelled.** The chip's accessible name says what the click will do before it happens, not after.

## Rules

- Behind `runtimeConfig.public.ads` (default off). Off means byte-for-byte current behaviour.
- No client dependency. One `<script>` or none — if a network needs one, it goes through rule 9 sign-off with the rest of this task, isolated.
- One `window.open` per click, never a synthetic one.
- Do not touch the embed, the iframe, or the click handling inside it; the provider's own popunder still fires underneath and we do not fight it.
- `/go/*` is our own path: uncached by the edge rules, `no-store`, and must work when the ad network is unreachable (fall back to a plain 302 to the destination, or to `kwip.fyi` if there is none).
- Budget: no render-blocking cost, and no more than two third-party hosts on the event page for this task alone.
- Ad scripts are the only third-party runtime allowed on the page. That breaks anonymity-by-default, so `DECISIONS.md` comes out of this saying so rather than pretending otherwise — flag the wording to me, do not edit that file.

## Verify

- Unit-test eligibility (which clicks qualify, dedupe within a session, off-flag, already-selected chip) and the `/go` handler with and without a configured destination.
- Prove with Playwright at 390 px and 1280 px that exactly one tab opens on the first qualifying click, that the stream still loads, that a blocked ad request does not stop the stream, and that nothing opens on a second click.
- `pnpm build`, `pnpm test`, `wrangler deploy --dry-run` clean.
- Report CLS and the third-party request count on an event page before and after, measured, not asserted.

`CONTRACT.md` scope applies. Leave the flag off in production until I say otherwise.

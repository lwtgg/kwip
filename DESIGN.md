# Design pass (offline, OSS-sourced)

v1 works and is plain. This pass raises perceived quality using patterns from public repos, and nothing else — no new dependency (rule 9), no component library (rule 2), no media proxy (rule 4). Every item below is implementable with the existing tokens, components and Tailwind.

## References and what to take

| Repository | Take | Ignore |
|---|---|---|
| [OgBek/footyLive](https://github.com/OgBek/footyLive) | Kickoff→live elevation without a reload; a scrollable league shelf that hides leagues with no entries; card badges for quality and source tag; skeletons shaped like the real layout; player "shield" toggle for third-party iframes | Glassmorphism and glow, multistream grid, scraping providers, Redis cache |
| [rampstackco/game-console-ui-theme](https://github.com/rampstackco/game-console-ui-theme) | Hero focus ring, tile-row rhythm, spatial arrow-key behaviour, larger display type on the hero | Console key hints in the page chrome |
| [lozza/TellyGrid](https://github.com/lozza/TellyGrid), [compose-epg-viewer](https://github.com/sajidalidev/compose-epg-viewer) | "Now / next" framing: the live window is a span, so it should render as elapsed-remaining, not a static badge | Grid columns and a time axis (we are a list, not a schedule grid) |
| [iptv-org/epg](https://github.com/iptv-org/epg) | Nothing visual; confirms that a source is a channel and a channel list wants chips, not a dropdown | — |

Rules: tokens in `app/assets/css/theme.css` only, dark first and light never worse, reduced-motion respected on everything that moves.

## P0 — clearly worth doing

1. **Live progress.** `StreamCard`, hero and player get a thin `role="progressbar"` bar over the `starts_at → ends_at` window, ticking from wall clock, hidden for `always_live === 1` and for `starts_at === 0`. Time text becomes "Ends in 42m" / "Started 18m ago" instead of a bare countdown. Fixes the review's frozen-countdown feel at the same time.
2. **Status as one pill.** Single `StatusPill` component: `Live`, `Upcoming in 2h 14m`, `Ended 3h ago`, `24/7`. Replaces the ad-hoc label spans in the hero and cards so status can never be asserted without a state.
3. **Source switcher as chips.** Replace the `<select>` with a wrapping row of chips carrying `source_tag` and a link/embed icon, `aria-pressed`, arrow-key roving tabindex, and the current one marked. Names stay in the label for screen readers. The select stays as the `noscript`/fallback path.
4. **Category bar hides dead categories** and keeps "All" first; a category with zero entries is still reachable at its own URL, just not advertised in the jump bar.
5. **Poster-less cards get a two-colour gradient** from `colors[0]`/`colors[1]` plus a monogram, instead of the flat single colour. That is what the feed's colours are for; real blurhash decode is P2.
6. **Focus-visible tokens**: one `--focus-ring` token, applied to every interactive element, including inside rails and the player overlay. No `outline: none` anywhere.

## P1 — polish

7. **Hero secondary strip**: under the hero, three compact "next up" cards on a hairline divider, so the front page has somewhere to go when nothing is live.
8. **Player "shield" control**: per-source toggle that reloads the frame with `sandbox="allow-scripts allow-same-origin allow-presentation"` for the ones that spawn popups, with a one-line explanation and the choice remembered per source name in `localStorage`. Must never be the default until a source is known to need it.
9. **Viewer count formatting**: `5.1k` in dense card contexts, exact in the player metadata; `aria-label` carries the exact number.
10. **Empty and error art**: CSS-only glyphs (circle + slash, hourglass) at the existing `StateBlock` sizes, so states read as designed rather than as paragraphs.

## P2 — later

11. Blurhash decode: a ~600-byte inline decoder, one dependency-free file, needs rule 9 sign-off anyway.
12. Density switch (comfortable/compact) persisted like the theme.
13. OG images per event: static fixture poster only; no runtime rendering without a dependency.

## Out of scope here

Multistream, favourites/watchlist (needs auth or storage), search, image proxy (rule 8), any colour rework of the token palette itself.

# 49a · Apple Sports, translated for kwip

## Verdict and scope

Recommend **time-and-availability cards**: Apple Sports’ compact match board, with the known start time or truthful availability occupying the prominent numeric/status position. Replace the poster spotlight hierarchy, preserve Touchline and the source/player system. A new palette would not solve the mismatch.

**Critique: 28/40 · Acceptable**, using 45a’s ten Nielsen heuristics, each scored 0–4. This is a usability score, not approval of the current visual direction. 45a scored 25/40 on its earlier rendered build. Several of its defects have since been fixed; these scores have different evidence and are not a measured three-point improvement.

Method: independent source assessments (A: design_assessment; B: evidence_assessment), followed by synthesis. Reviewed current home, category, event/player, archive, replay, shell, state components, feed types and theme tokens. Public reference screenshots were inspected, including Lickability’s multi-sport scoreboard. No fresh local browser matrix, measured contrast, CLS or playback validation was performed for this docs audit. The historical 45a captures and CLS 0 result are not current evidence. No overlay or new UI was created. This report is the requested planning artifact, not a completed technical accessibility audit.

Read AGENTS.md, CONTRACT.md, DECISIONS.md (including 12, 22, 23), DESIGN.md, PRODUCT.md, the brief and 45a. Skills: impeccable (direction and critique), web-design-guidelines, kwip-conventions, frontend-design, frontend-design-review, tailwind-best-practices, writing-plans and verification-before-completion. Also consulted webapp-testing and orca-cli for the browser verification path; browser validation remains a later implementation gate. The user’s docs-only scope and destination govern this artifact; no implementation or extra critique snapshot is authorized by this plan.

## Reference evidence

Public material accessed 23 November 2026. Launch material and later app behavior are distinguished below; neither is a claim that every app version has the same UI.

| Source | Observation | Translation |
|---|---|---|
| [Apple launch release, 21 February 2024](https://www.apple.com/newsroom/2024/02/introducing-apple-sports-a-new-app-for-sports-fans/) | Favourites shape the scoreboard; a game opens deeper statistics and routes toward watching. | Make relevance and the next action immediate. Move source detail to the event URL. |
| [Lickability critique, 27 March 2024](https://lickability.com/blog/apple-sports/) | Screenshots put both crests beside large compact scores, with game state between them and subdued team-colour fields. Labels stack over tinted art; custom segmented navigation recedes. | Preserve simultaneous recognition and comparison, not the exact native effects. |
| [Six Colors comparison, 23 April 2026](https://sixcolors.com/post/2026/04/scoring-the-differences-between-espn-and-apple-sports/) | Favourites keep Apple focused, but baseball detail hierarchy can obscure what a fan needs. | Do not assume copying a game sheet makes it useful; prioritize our actual task and data. |
| [App Store description and accessibility declarations](https://apps.apple.com/us/app/apple-sports/id6446788829) | Score/stat purpose; developer lists VoiceOver, Voice Control, larger text, dark interface, differentiation without colour, sufficient contrast and reduced motion. | Treat these as design requirements to verify on the web, not evidence that kwip complies. |

The reference’s signature is compressed event information with colour behind it. The score is large because it answers the app’s primary question. A tap reveals box score, play-by-play, lineup and stats rather than crowding the board. A website should borrow that hierarchy, not create empty statistics tabs.

“No onboarding” is our intended immediate-entry behavior, not a literal description of Apple Sports: the launch welcome screen and favourites setup are publicly visible. Controls arriving at a game means source and player controls stay at the event; date, sport, theme and density controls must remain discoverable in the directory.

No native navigation-bar stretching, vibrancy blend modes, jersey shader, animated background, native sheet or Live Activities is required. Lickability’s treatment is useful visual evidence, not a prescription to recreate its implementation. SF uses the existing system stack; no bundled Apple font or copied assets.

## Findings against today’s surfaces

Priorities follow 45a: P0 blocks use, P1 materially obstructs the task, P2 weakens hierarchy or coherence, P3 is cosmetic. These are grouped findings, not counts of every repeated instance.

| Category | Count |
|---|---:|
| Surface and colour | 2 |
| Typography | 1 |
| Layout and interaction | 4 |
| Copy and chrome | 1 |
| States and recovery | 1 |
| **Total** | **9** |

| ID | Severity · evidence | Finding and intended correction |
|---|---|---|
| F1 | P1 · `app/pages/index.vue:257` | The mobile feature allocates a full-width 16:9 poster before the name. Apple lets several games compete in the first scan. Make the first event an ordinary compact card rather than a separate media hero. |
| F2 | P1 · `app/pages/index.vue:345` | The home banner precedes next-up choices. It magnifies the single-feature bottleneck. Put a useful initial event group before the directory banner; retain its reserved dimensions. |
| F3 | P1 · `app/pages/index.vue:95` | Selection favors 24/7 ahead of upcoming, then chooses the most-viewed upcoming event rather than nearest kickoff. Recommend scheduled live, then next up; place 24/7 separately below. This is a proposed change to the current selection rules. |
| F4 | P1 · `app/components/StreamCard.vue:119` | Card status overlays the poster, listing status moves into metadata, and home has another arrangement. There is no stable timing anchor. Give time/status the same position across home and category. |
| F5 | P2 · `app/components/StreamCard.vue:91` | Rectangular poster wells carry recognition, even when art is absent. The reference identifies opponents beside the important fact. Use complete event names and optional feed art; never invent structured teams by splitting a title. |
| F6 | P2 · `app/assets/css/theme.css` (`listing-display`) | Weight 850 applies to titles and section headings alike. Large heavy names compete with timing. Keep system type, give names quieter emphasis and use tabular compact numerals for time. No condensed-font dependency. |
| F7 | P2 · `app/pages/c/[category].vue:172`, `app/pages/vods/index.vue` | Feature, thumbnail listing, four-column category grid and archive rails demand different scanning patterns. Share card anatomy and reading edges; allow replay dates to replace kickoff timing. |
| F8 | P2 · `app/pages/index.vue:301`, `app/pages/live/[...uri].vue:758` | Category, tag, audience count, status and progress compete in metadata stacks. Put event identity and availability first; keep league secondary and audience counts tertiary. |
| F9 | P2 · `app/components/StateBlock.vue`, `app/pages/index.vue` | Recovery exists, but the new board needs an explicit stale treatment across every timing anchor. Preserve listings and Refresh while qualifying status; suppress any fresh-looking urgency or numeric countdown. Do not style stale cached data as a current scoreboard. |

F9 is a preservation requirement under the new direction, not a claim that current stale labels are absent. Current labelled help, minimum targets, sentence-case titles, plain errors and recovery exits address older 45a findings. Do not reintroduce those defects or report them as still present.

| Heuristic | Score / 4 | Current evidence |
|---|---:|---|
| Visibility of status | 3 | Shared status/progress and freshness exist; time is subordinate to art. |
| Match with real world | 3 | Familiar event names; composition suggests a media catalogue. |
| User control and freedom | 3 | Breadcrumbs, filters, alternatives and exits. |
| Consistency and standards | 2 | Several listing geometries and timing positions. |
| Error prevention | 3 | Source kinds and stale qualification exist; advertising complicates click expectations. |
| Recognition over recall | 3 | Named navigation helps; timing has no common anchor. |
| Flexibility and efficiency | 3 | Filters/density help; popularity obscures nearest kickoff. |
| Aesthetic and minimalist design | 2 | Poster, heavy names and metadata compete. |
| Error recovery | 3 | Retry, Refresh and current-event exits are present. |
| Help and documentation | 3 | Labelled player help is local and actionable. |
| **Total** | **28/40** | **Acceptable; visual direction still misses the reference.** |

Strengths to retain: centralized status/recovery, reserved media geometry, source identity adjacent to playback, ordinary deep links, and system-wide focus and reduced-motion foundations. Cognitive load is moderate: single focus, hierarchy and one decision at a time fail the rubric’s source review (3/8); source choice count depends on the feed and is not asserted as a fixed number.

For the hurried phone visitor, the valley is scrolling past someone else’s feature and ad. For a returning fan, popularity is not personal relevance. For a low-vision keyboard visitor, current focus and target foundations help, but tinted cards require new contrast and clipping checks. For a weak-connection visitor, fallback art works but still consumes the hero’s large space. The intended high point is immediate recognition of the right event; the end is a clear selected source or a specific recovery action.

## The web translation

### Event card without a score

The central fact becomes the scheduled start time in compact tabular system numerals, labelled with a timezone, or a prominent textual availability state. Never show `0–0`, placeholder score dashes, a match clock inferred from kickoff, or viewer counts in score positions.

| Data state | Primary fact | Supporting line |
|---|---|---|
| Future known start | Local start time, e.g. `19:30` | `Today · PDT` or explicit date/timezone; locale-appropriate formatting. |
| Within scheduled window | `Live` | Start time; live is schedule-derived, not a source-health guarantee. |
| 24/7 | `24/7` | Channel identity, in its own group. |
| Ended | `Ended` | Event date; replay link only when actually available. |
| Missing/invalid start | `Time unavailable` | Preserve the intact event name and event link. |
| Stale feed | `Unconfirmed` | Last listed state/time and freshness warning; no ticking countdown. |
| Replay | `Replay` | Actual event date, never a fabricated final score. |

Proposed anatomy, read in DOM order as event identity, time/state, supporting facts:

```text
┌────────────────────────────────────────────┐
│ Complete event name                 19:30  │
│ League or sport               Today · PDT  │
└────────────────────────────────────────────┘
```

The card is one link to `/live/<uri>`, with no nested source buttons. At narrow widths or enlarged text, time may stack beneath the name while keeping its visual role. “Central” describes information priority, not a requirement to squeeze three rigid columns into 320 px. Do not force two crests into this version: `FeedStreamItem` has one name and no opponent or crest fields. If structured data arrives later, two genuine opponent identities can flank the fact without changing this v1 contract. Non-match events and channels keep the same complete-name fallback.

### Colour without team-colour data

Use existing `colors[]` only as poster-derived decorative seeds, never as asserted team colours. Validate the values, mix them conservatively into the theme surface using centrally defined tokens, and keep foreground/muted text on a controlled backing. If a seed is absent, malformed or cannot pass contrast, use the neutral Touchline surface. A neutral card is preferable to false identity. Do not sample images in the browser or add an extraction dependency.

Tint is static and subordinate; mint remains the action/focus colour. Text stacking can reproduce the reference’s layered hierarchy using opaque token-backed text, without copying native vibrancy or relying on blend modes over unpredictable images. Both themes must bound tint independently. Any new tint-strength, time-size or layout tokens belong in `theme.css` during implementation, not arbitrary component values.

### Relevant first, without favourites

Within the selected date and category: scheduled live first, nearest upcoming next, ended events last if present. Keep existing viewer ordering within scheduled live initially; break equal counts by kickoff then stable event identity. Upcoming sorts by start then identity. Put 24/7 outside date-dependent groups, below scheduled live and upcoming, and label it clearly. Deduplicate promoted entries rather than repeating a spotlight in another rail. This changes home selection and requires an explicit implementation spec update before code.

No stars, “For you,” favourites prompts, account screen or storage substitute in v1. Useful defaults replace the ranking benefit of favourites, not personalization itself. No score service, extra backend or database is introduced.

The **date strip is proposed web functionality**, absent today. Show Today and dates actually represented by the loaded schedule, as ordinary reachable links with a selected state and visible overflow. Keep All/Live/Upcoming as distinct status filters. Define selected days in one displayed timezone; the implementation must make SSR and hydration agree before localizing. A day without entries is an empty selection with a Today escape, not a fabricated fixture calendar. Unknown schedule times and 24/7 stay explicitly separate. Archive remains at `/vods`; choosing yesterday must not silently invent replay availability or fetch unsupported history.

### Game sheet becomes an event URL

Use a normal page with browser Back, direct links and readable breadcrumbs, not a simulated native sheet. Event identity/time leads into the existing reserved player area. The active source remains next to the frame; alternatives and their real link/embed type follow, with Shield/fullscreen/help only where relevant. Put the fixed banner **below the player and its controls**. Available source information is our equivalent of dense game detail. Box score, lineup, stats and play-by-play are absent, so no empty tabs or implied support.

An event listing links to our event page, which links out to or frames a third-party player. kwip hosts no game media. Do not flatten this into “every event opens an external site”: `sources[].type` determines the behavior. Preserve native no-JavaScript source fallback, ad-blocker behavior, recovery, source ordering and health logic. The visual pass does not change the click-under policy.

## Page inventory

All treatments below are proposed; shared anatomy applies at phone and desktop widths, with bounded desktop reading width and additional columns only when names remain legible.

| Surface | Intended treatment |
|---|---|
| Home `/` | Quiet shell; date strip and existing status filters; live/next-up event board before directory banner; separate 24/7 group. No large poster hero and no repeated featured event. |
| Category `/c/<category>` | Same timing anchor and card anatomy, scoped title and date/status controls; no four-column miniature poster catalogue. Keep category and Home exits. |
| Event/player `/live/<uri>` | Larger identity/time header, reserved player, adjacent selected source and alternatives, local help; banner after player controls, related events afterward. Upcoming/unavailable state occupies the same player geometry. |
| Archive `/vods` | Same recognition grammar with replay label and event date; preserve league grouping and actual archive filtering. Existing archive banner follows useful content, never masquerades as a replay. |
| Replay `/vods/<slug>` | Match identity and real date, then supported third-party playback/link treatment. No invented result. Existing playlist `<video>` branch is a separate playback-policy question; this audit does not remove it or authorize a new native player. No new banner placement. |
| Stale, across routes | Keep known listings and local Refresh with last-update context; every affected card qualifies availability. No fresh-looking Live urgency or moving progress. Alerting is separate from this UI. |
| Empty, date/filter/category/archive | Keep heading and controls; say what selection is empty, offer Today/current events or a clear-filter escape. No illustration that displaces recovery. |
| Error, feed or event | Keep heading/navigation and plain Retry. Distinguish failed fetch from authoritative unavailable event; source failure offers another source, not a page-level dead end. |
| Loading | Skeleton follows final compact card/player geometry; do not reserve a discarded poster hero. Loading indicators do not announce changing decorative content. |
| Dark | Default per decision 12; existing dark Touchline canvas/surfaces, limited muted tint, readable opaque ink and mint focus. |
| Light | Existing light Touchline surfaces/ink; separately bounded tint so card labels, dividers and selected controls remain legible. Same hierarchy, content and controls. |

About/mirrors and shell navigation inherit typography/focus discipline; no content rewrite or new routes are proposed there. Canonical links and absolute `og:url` remain on the configured canonical host; mirrors never become internal destinations.

## Constraint table and acceptance evidence

These are acceptance criteria, not measurements from this task.

| Constraint | Required behavior | Evidence before implementation ships |
|---|---|---|
| Tinted text | Normal text ≥4.5:1; large text ≥3:1; meaningful controls/focus ≥3:1 against adjacent surfaces. No colour-only status/selection. | Measure composite backgrounds for both themes, normal/hover/selected/focus, worst-case seeds and neutral fallback. Test without colour. |
| CLS and numerals | Reserve art, crest/fallback if ever supported, timing column, player and banner geometry. Tabular numerals plus enough width for locale/timezone prevent ticking or hydration shifts. | Slow/failed artwork, SSR→hydration and clock-boundary capture; aim for CLS 0 from these elements, total ≤0.1. Recheck 200% text without rigid clipping. |
| Banner position | Event banner stays below player and source controls. Directory banners follow useful listings. Existing slots remain fixed: desktop 970×90, mobile 320×100; no creative-driven resizing. | Ad on/off/blocked, mobile/desktop; inspect order and reserved geometry. No automatic advertiser navigation on home. |
| Density | Comfortable/compact change spacing only. Same fields, type, card structure, media allocation, ordering and ≥44 px control targets. | Compare both densities; no title/metadata hiding or card-to-row structural switch. |
| Reduced motion | No animated tint, shader, pulsing status or entrance required. User-triggered transitions respect reduced motion. | OS preference on/off; state remains understandable with motion absent. |
| Focus | Visible ring survives source remounts; no clipping in cards/date overflow; sticky shell cannot obscure focused controls. Preserve semantic links and selected-state text. | Keyboard through date/status controls, cards, source fallback and help; inspect both themes and densities. |
| Data honesty | No score, crest, lineup, personal relevance or complete-calendar claims without data. Schedule-derived Live is not verified source health. | Missing/invalid time, channels, long/non-match names, malformed colours and stale fixtures. |
| Playback and ads | Keep iframe/link distinction, source fallback and session click-under semantics. Ad blocker must not break navigation/player. | Existing source/banner/click-under browser checks, including native select with JavaScript disabled. |
| Freshness / decision 23 | Stale UI explains the feed; it is not an operational alarm. Do not add client polling alarms or alter pinger thresholds. | Check stale/error/recovered UI; leave refresh monitoring and its credentials untouched. |
| System continuity | Tokens remain centralized; no new dependency, image proxy, component library, font asset or backend. | Diff and bundle checks when implementation adds components/routes/assets. |

Preserve the **actual** current palette rather than silently restoring 45a’s proposed dark ramp: dark canvas `#0c100f`, surface `#1b201e`, raised `#2c3430`, ink `#edf2ef`, muted `#aeb8b2`, accent `#73e4b0`; light canvas `#f5f8f5`, surface `#ffffff`, raised `#e4ede7`, ink `#15251e`, muted `#4c6056`, accent `#086347`. Existing radii, density tokens, focus system and system font remain. Tint bounds and time hierarchy may require new semantic tokens, not a palette replacement.

## Genuine choices

| Decision | Options | Recommendation and reason |
|---|---|---|
| How literal should the match card be? | A: intact name plus prominent time/state; B: symmetrical opponent/crest card; C: poster tile with a larger time. | **A.** It delivers the reference’s scanning hierarchy with current data. B needs structured opponents; parsing names invents certainty. C retains the rejected media-first composition. |
| How much colour? | A: neutral Touchline throughout; B: bounded poster-seed tint; C: inferred team colours or sampled imagery. | **B with A fallback.** It keeps the reference’s event variation while protecting theme contrast. C adds unreliable identity and runtime complexity. |
| What occupies the top? | A: scheduled live then earliest upcoming; B: current popular feature/24/7 hierarchy; C: locally saved favourites. | **A.** Immediate useful defaults require no setup/storage. Keep popularity only within live initially. B hides the nearest event; C is outside v1. |

## Follow-through and open questions

This audit recommends a direction; it does not supersede DECISIONS.md or rewrite DESIGN.md. Only the orchestrator may record binding decision changes. Before implementation, reconcile selection/date semantics with SPEC.md and the design work order.

1. **Card/time prototype:** future changes in `theme.css` and `StreamCard.vue`; compare missing art, unknown time, long event name and 24/7 in both themes. Reject any design that requires invented opponents or a score.
2. **Directory composition:** future changes in `index.vue`, `c/[category].vue`, `vods/index.vue` and shared rails. Agree on date URL/timezone semantics, apply stable ordering and deduplication, then prove date/status combinations and honest empty states.
3. **Detail continuity:** future changes in `live/[...uri].vue` and `vods/[slug].vue` only for presentation. Verify source focus, fallback, upcoming/end/stale states and banner position before accepting visual parity.
4. **Acceptance gate:** fresh 390×850 and 1280×850 captures in both themes and densities for home, category, event, loaded player, archive, replay, empty, stale and error; add 320 px/200% text, keyboard, reduced motion, no-JavaScript, bad artwork and ad-blocker cases. Run the repo build/test/dry-run and applicable browser tests. No visual score or performance claim follows from a source detector alone.

Open questions for the next brief (recommendations allow this docs task to finish):

- What date query format and SSR timezone should be canonical? Recommend explicit date links with a deterministic initial timezone; only expose dates in the loaded schedule. Do not imply historical feed support.
- Is genuine opponent/crest data planned? Until a feed contract exists, ship intact names and time/state cards; no team parsing or extra asset service.
- How should the existing playlist replay branch reconcile with the documented no-native-player constraint? Keep that policy decision separate from visual work.

Questions skipped in chat: this brief explicitly requests documented options and open questions, with no implementation in this task.

## Verification

The source detector (`impeccable detect --json app`) returned `[]` with exit 0. It does not evaluate the proposed layout or establish contrast/accessibility compliance.

- `pnpm build`: passed, exit 0.
- `pnpm test`: passed, 144 tests, zero failures.
- `pnpm exec wrangler deploy --dry-run --outdir /tmp/kwip49a-dry`: passed, exit 0; emitted ignored-bare-import warnings for generated `node:process` imports. No production deploy.
- `git diff --check`: passed. Changes are limited to this document and PRODUCT.md; no package.json changes or dependencies.

Logs for this run: `/tmp/49a-build.log`, `/tmp/49a-test.log`, `/tmp/49a-dry.log`. Browser acceptance criteria above remain unexecuted for this docs-only proposal.

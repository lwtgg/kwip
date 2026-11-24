# 49a · Apple Sports, translated for kwip

## Verdict and scope

Recommend **Apple Sports card language within kwip’s existing streaming layout**: retain the featured hero, next-up strip, rails, poster recognition and event/player structure. Carry over the rounded ground, inset content, edge art, emphatic compact numerals and quieter label stack. Known start time takes the numeric emphasis; availability remains truthful. This 49b revision supersedes recommendation A and the earlier proposal to replace the hero and rails with a match board. Preserve Touchline and the source/player system.

**Historical 49a critique: 28/40 · Acceptable**, using 45a’s ten Nielsen heuristics, each scored 0–4. This is the earlier usability assessment, not a new score or authority to discard the owner-approved layout. 45a scored 25/40 on its earlier rendered build. Several of its defects have since been fixed; these scores have different evidence and are not a measured three-point improvement.

Historical 49a method: independent source assessments (A: design_assessment; B: evidence_assessment), followed by synthesis. Reviewed current home, category, event/player, archive, replay, shell, state components, feed types and theme tokens. Public reference screenshots were inspected, including Lickability’s multi-sport scoreboard. No fresh local browser matrix, measured contrast, CLS or playback validation was performed for this docs audit. The historical 45a captures and CLS 0 result are not current evidence. No overlay or new UI was created. This report is the requested planning artifact, not a completed technical accessibility audit.

Historical 49a reading: AGENTS.md, CONTRACT.md, DECISIONS.md (including 12, 22, 23), DESIGN.md, PRODUCT.md, the brief and 45a. Skills: impeccable (direction and critique), web-design-guidelines, kwip-conventions, frontend-design, frontend-design-review, tailwind-best-practices, writing-plans and verification-before-completion. Also consulted webapp-testing and orca-cli for the browser verification path; browser validation remains a later implementation gate. The user’s docs-only scope and destination govern this artifact; no implementation or extra critique snapshot is authorized by this plan.

## Reference evidence

The owner-supplied images were read directly with the image tool before the documents on 23 November 2026. They govern this revision; the earlier public-source interpretations yield where they conflict. These are different surfaces and versions, not one universal card template. Dimensions below are proposed web tokens, not measured native specifications.

| Local screenshot in `/tmp/kwip49-refs/` | Visible evidence | Translation |
|---|---|---|
| `Apple-Sports-welcome-screen_inline.jpg.large.jpg` | Black canvas; green header fades to black. Featured Games uses separate rounded charcoal cards with narrow gaps. Crests sit at the outside edges, tall heavy scores inward, game state centered, league above and small team names below. Upcoming uses time and records instead of large scores. | Rounded inset ground, edge recognition and explicit label hierarchy; our large time is a deliberate adaptation, not a claim that Apple enlarges upcoming time this way. |
| `Apple-Sports-HOZ.png` | Welcome, detail and list side by side. The list has compact two-sided team-colour fields; detail expands to a much stronger orange-to-blue field behind numbers, identity and stats. | Event colour can be visible without replacing the page palette. Keep strong detail colour separate from small-card bounds. |
| `00cRHdooLpmPK3Fbykdnku4-4..v1741897186.png` | Wide marketing hero: left is lock-screen Live Activities with saturated paired gradients; middle and right are app screens with dark grouped rows and hairline separators. Green/blue header fields recede into the list. Tall scores dominate; names and round labels recede. | Borrow numeral presence and spacing, not the lock-screen architecture or its saturation for every listing. Preserve kwip’s hero and rails. |
| `13a2c8dfe2286789e5c4694cbab5a4a1.png` | Green header over a largely neutral dark grouped list. Tennis has stacked player identities and multiple narrow numeric columns; baseball uses outer crests, inward scores and central state. Losing final scores are dimmed. | Identity and the main numeric fact have distinct lanes. No copied tennis columns, loser dimming or result semantics without data. |
| `Apple-Sports-updates-lp.jpg.landing-big_2x.jpg` | Blue tournament surfaces, compact fixtures, rounded group tables and a bracket; the lineup screen uses a much stronger blue/red split field. | The language survives different content structures. It does not require replacing our structure with a scoreboard, bracket or lineup. |

The card language is the reference: a contained ground, generous internal inset relative to the short row, rounded corners, identifying art at the edges, heavy narrow-looking numerals and smaller supporting labels. Neutral charcoal lists and colourful surfaces both occur. The screenshots do not establish exact font identity, CSS radii, HSL bounds or opacity values.

The welcome screen visibly has onboarding; kwip keeps immediate entry. Native vibrancy, sheets, Live Activities, shaders, stats tabs and copied Apple assets are not required. Keep the existing system font stack and no bundled Apple font.

## Findings against today’s surfaces, reconciled with the owner’s layout

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
| F1 | P1 · `app/pages/index.vue:257` | The mobile feature allocates a full-width 16:9 poster before the name. The reference provides a clearer numeric emphasis within its cards. Retain the featured hero and poster; give its time and availability the reference’s clear numeric hierarchy. |
| F2 | P1 · `app/pages/index.vue:345` | The home banner precedes next-up choices. Its placement still needs the first-group eligibility rule below. Put a useful initial event group before the directory banner; retain its reserved dimensions. |
| F3 | P1 · `app/pages/index.vue:95` | Selection favors 24/7 ahead of upcoming, then chooses the most-viewed upcoming event rather than nearest kickoff. Recommend scheduled live, then next up; place 24/7 separately below. This is a proposed change to the current selection rules. |
| F4 | P1 · `app/components/StreamCard.vue:119` | Card status overlays the poster, listing status moves into metadata, and home has another arrangement. There is no stable timing anchor. Give time/status the same position across home and category. |
| F5 | P2 · `app/components/StreamCard.vue:91` | Rectangular poster wells carry recognition, even when art is absent. The reference identifies opponents beside the important fact. Keep the poster as identifying art and complete event names; never invent structured teams by splitting a title. |
| F6 | P2 · `app/assets/css/theme.css` (`listing-display`) | Weight 850 applies to titles and section headings alike. Large heavy names compete with timing. Keep system type, give names quieter emphasis and use tabular compact numerals for time. No condensed-font dependency. |
| F7 | P2 · `app/pages/c/[category].vue:172`, `app/pages/vods/index.vue` | Feature, thumbnail listing, four-column category grid and archive rails demand different scanning patterns. Share visual anatomy and reading edges within the existing hero, rails and grids; allow replay dates to replace kickoff timing. |
| F8 | P2 · `app/pages/index.vue:301`, `app/pages/live/[...uri].vue:758` | Category, tag, audience count, status and progress compete in metadata stacks. Put event identity and availability first; keep league secondary and audience counts tertiary. |
| F9 | P2 · `app/components/StateBlock.vue`, `app/pages/index.vue` | Recovery exists, and the retained cards need an explicit stale treatment across every timing anchor. Preserve listings and Refresh while qualifying status; suppress any fresh-looking urgency or numeric countdown. Do not style stale cached data as a current scoreboard. |

F9 is a preservation requirement under the new direction, not a claim that current stale labels are absent. Current labelled help, minimum targets, sentence-case titles, plain errors and recovery exits address older 45a findings. Do not reintroduce those defects or report them as still present.

| Heuristic | Score / 4 | Current evidence |
|---|---:|---|
| Visibility of status | 3 | Shared status/progress and freshness exist; time is subordinate to art. |
| Match with real world | 3 | Familiar event names; poster recognition stays; timing needs more emphasis. |
| User control and freedom | 3 | Breadcrumbs, filters, alternatives and exits. |
| Consistency and standards | 2 | Several listing geometries and timing positions. |
| Error prevention | 3 | Source kinds and stale qualification exist; advertising complicates click expectations. |
| Recognition over recall | 3 | Named navigation helps; timing has no common anchor. |
| Flexibility and efficiency | 3 | Filters/density help; popularity obscures nearest kickoff. |
| Aesthetic and minimalist design | 2 | Poster, heavy names and metadata compete. |
| Error recovery | 3 | Retry, Refresh and current-event exits are present. |
| Help and documentation | 3 | Labelled player help is local and actionable. |
| **Total** | **28/40** | **Historical assessment; 49b corrects the layout recommendation.** |

Strengths to retain: centralized status/recovery, reserved media geometry, source identity adjacent to playback, ordinary deep links, and system-wide focus and reduced-motion foundations. Cognitive load is moderate: single focus, hierarchy and one decision at a time fail the rubric’s source review (3/8); source choice count depends on the feed and is not asserted as a fixed number.

For the hurried phone visitor, the hero must expose timing and the next action immediately; banner eligibility still protects access to choices. For a returning fan, popularity is not personal relevance. For a low-vision keyboard visitor, current focus and target foundations help, but tinted cards require new contrast and clipping checks. For a weak-connection visitor, preserve the hero’s reserved art geometry and show identity/time even when art fails. The intended high point is immediate recognition of the right event; the end is a clear selected source or a specific recovery action.

## The web translation

### Card anatomy within our layout

Keep the existing hero, next-up strip, rails, category grid and archive grouping. Do not impose a new two-column 64rem board or hide artwork below md. Each existing card remains one link to its event; a visible `Watch` cue is part of that link, not a nested button or a promise that playback is already running.

The reference’s standalone cards have a rounded charcoal ground separated by a small strip of canvas; grouped lists instead share one rounded container and use fine internal rules. Contents sit well inside the perimeter. Corners are rounded rectangles, not pills; logos remain legible, contained and uncropped. For kwip keep existing radius tokens, `--card-pad`, `--card-gap` and `--rail-gap`; the screenshot relationship is a guide to inset and rhythm, not permission to hardcode native geometry. Density changes spacing only. A rail keeps its existing horizontal rhythm; a hero keeps its larger art allocation.

| Reference element | Stream-listing translation |
|---|---|
| Left crest / left identity | One genuine feed poster is the identifying art, in the existing hero/card art region and visible on mobile too. Preserve reserved aspect ratio and existing failed-art fallback. Do not crop a poster into a pretend crest. |
| Right crest / second opponent | No second identity is available. Omit the second crest slot and use the action edge for the textual `Watch` cue; that cue is an action, never a replacement team. Do not duplicate the poster, insert a sport icon as an opponent, or leave a phantom crest well. |
| Two inward scores | One large start-time block; a verified live clock could occupy it only if a future feed supplies one. Do not mirror the time into two score positions. |
| League above / team names below | Quiet league or sport label, intact event name, strong time, then date/UTC and truthful availability. Keep art next to this identity stack rather than relegating it to optional desktop decoration. |
| Central game state | Existing shared availability treatment and schedule progress, visibly distinct from the large numeric fact. Preserve stale qualification. No inferred period, score, possession or clock. |

Conceptual reading order within existing card geometry: **art and complete event name → large time → date/UTC and availability → Watch cue**. League is secondary and viewers tertiary. On narrow cards, the text stack grows below the art rather than squeezing into a symmetrical scoreboard. The name may clamp to two lines with its full accessible name retained; timing and availability wrap without truncation. Preserve minimum 44 px targets in both densities and complete event names on detail pages.

Crest pairs are central enough to merit a separate data-resolution proposal, but **splitting a name is not sufficient identity evidence**. A future resolver would need unambiguous opponent records and verified crest assets, including collision, tournament, non-match and missing-team handling. Current v1 has one name and poster: keep both, with no name parsing, asset service, guessed logos or backend in this revision. The art-led fallback is intentional, not an assertion of visual equivalence to two genuine crests.

### Big numerals for time, without an invented clock

The visible scores are tall, heavy and compact in width; they command more attention than team names or center status. Retain that emphasis for the known kickoff. Proposed semantic tokens for implementation: card time **2.25rem**, hero/detail time **3.5rem**, weight **850**, line-height **1**; event name **1rem / 600** on cards, **2rem / 600** on hero/detail, and secondary labels the existing metadata size. Density never shrinks the time. These are web targets, not sampled Apple font metrics.

Use the existing system stack with lining, tabular numerals. Prefer a supported condensed font-width variant with normal-width fallback; never horizontally transform glyphs or import an Apple font. Reserve at least **5ch** for `19:30`, letting locale-specific forms grow; timezone/date remain separate metadata. A narrow card may stack the block, but must not clip digits at 320 px or 200% text. The scale and width require semantic tokens in `theme.css` later; no code changes here.

| Data state | Dominant fact | Supporting line |
|---|---|---|
| Future known start | Large `19:30` | Actual date · UTC, plus availability. |
| Within scheduled window | Large known kickoff `19:30` | `Started at · UTC` with actual start date and schedule-derived `Live`; not source-health verification. |
| Verified live clock, future data only | Actual supplied clock, clearly labelled | Only with an explicit clock contract and freshness semantics; current feed has none. |
| 24/7 | `24/7` | Channel identity in its own group, no elapsed match clock. |
| Ended | `Ended` | Actual event date; replay link only if available. |
| Missing/invalid start | `Time unavailable` in normal label typography | Full event identity and usable link; no enlarged dashes or fabricated digits. |
| Stale feed | `Unconfirmed` in normal label typography | Last listed time/state and freshness warning; no ticking clock or fresh-looking Live emphasis. |
| Replay | `Replay` | Actual event date, never a final score. |

Textual fallbacks grow and wrap; do not force a long state into the large numeral box. Kickoff-derived elapsed time, countdowns and progress describe the schedule only and cannot be labelled as the live match clock. Never show `0–0`, placeholder scores or viewer counts as the main numeric fact.

### Tint derived from the supplied screens

The welcome cards are almost neutral charcoal. The compact list in `Apple-Sports-HOZ.png` has recognisable paired hues under a dark veil, covering the whole card behind identity, numerals and labels. The much brighter orange/blue detail and lock-screen cards are different surfaces. Numbers remain opaque, high-contrast foreground above the field; the colour is neither a glowing border nor a patch behind only the art. The green or blue app header is a separate broad background, not evidence for saturating every card.

For kwip, use a static full-card field with a solid contrast-controlled backing under text. Keep the poster recognisable in its existing well. Feed `colors[]` are poster-derived seeds, not team colours; a two-ended field makes no claim to opponent identity. The following are proposed bounds chosen to translate the observed restrained list tint, not measurements of screenshot opacity:

1. Validate each of the first two seeds independently as a complete case-insensitive `#rgb` or `#rrggbb` string (`^#(?:[0-9a-f]{3}|[0-9a-f]{6})$`). Expand shorthand. No valid seeds means neutral `surface`; one valid seed makes a uniform field; two make a static left-to-right field.
2. Convert valid sRGB seeds to HSL, preserve hue, cap saturation at **60%**, and clamp lightness to **18–26% dark / 84–92% light**. These deliberately replace the earlier narrow 14–18% dark cap, which flattened visible event colour.
3. Composite each bounded endpoint over theme `surface` in per-channel sRGB at **35% colour / 65% surface** for listings and **50% / 50%** for the larger hero/detail identity ground. Define shared semantic tokens per surface, no arbitrary per-card strength. Never apply colour or a veil to the third-party player itself. This admits visible hue while keeping the strongest reference detail/Live Activity saturation outside small-card bounds.
4. Check both `fg` and `muted` at **≥4.5:1 across the entire final field**, including interpolated colours and hover/selected variants; checking endpoints alone is insufficient. Reject the whole field for neutral `surface` if either fails. Controls/focus also retain their separate ≥3:1 requirement. Light-theme bounds are our adaptation: the supplied screens do not prove light-theme contrast.

Use opaque foreground numerals, not translucent white or a numeral gradient. No browser image sampling, extraction dependency, animated tint or blend-mode text. Mint stays the action/focus colour. Preserve the current palette, radii and theme behavior; future tint/typography tokens live in `theme.css`.

### Our layout, on purpose

| kwip structure that stays | What the reference contributes |
|---|---|
| Featured hero and next-up strip | Large time, quieter label stack, inset ground and bounded event tint alongside retained poster art. A promoted event stays in its first group and appears once. |
| Rails and category/archive cards | Consistent numeral emphasis, contained art, rounded token-backed ground and spacing rhythm within existing responsive grids/rails. No mandatory two-column board. |
| Card as a single link | Clear event identity and Watch cue; deeper source choices remain on the event URL. |
| Event page with source at the frame edge | Identity/time hierarchy and a contained detail ground. Source controls remain adjacent to the reserved frame; no native sheet, box-score tabs or playback relocation. |
| Banner below player and controls | Existing reserved slot and decision 22 remain; reference colour never draws an ad into player chrome. |
| UTC date strip as the directory spine | Quiet selected-state hierarchy inspired by Yesterday/Today/Upcoming; preserve the URL, loaded-date and filter contracts below. It organizes our hero and rails rather than replacing them. |

When Apple’s screen architecture conflicts with the streaming layout, **kwip’s layout wins**. Selection is still live, upcoming, unknown time, 24/7, ended; none of these screenshots supplies a reason to change that ordering.

### Relevant first, without favourites

Within the selected category and status filter, use this group order: **live by viewers descending; upcoming by start ascending; unknown time by name ascending; 24/7; ended newest first** (end timestamp descending). Break live ties by start then event URI; upcoming/ended ties by URI. Name sorting uses a fixed English locale and URI as a tie-breaker; use the same name order for 24/7. Classify 24/7 before inspecting timestamps so channels cannot leak into scheduled groups. Missing/invalid start or an unusable schedule window belongs to unknown time, never inferred live or ended.

Date membership applies to scheduled groups as defined below. Unknown-time and 24/7 groups are undated and labelled separately, after upcoming and before ended in the stated order; they do not acquire a fabricated date. Status filters retain their meaning: Live includes scheduled live and 24/7; Upcoming includes only scheduled upcoming; All includes every eligible group.

Deduplicate by event URI across all groups, retaining the first occurrence in that group order. A promoted entry is the first eligible card in its own group, not a second copy above it; count it once and never repeat it in another rail or group. This changes home selection and requires an explicit implementation spec update before code.

No stars, “For you,” favourites prompts, account screen or storage substitute in v1. Useful defaults replace the ranking benefit of favourites, not personalization itself. No score service, extra backend or database is introduced.

The **date strip is proposed web functionality**, absent today. Its URL contract is `?date=YYYY-MM-DD`. The single display zone is **UTC**, documented beside the strip and used for start times, day membership and Today on both SSR and client. Scheduled event membership normally uses the UTC calendar date of `starts_at`. **Today additionally includes every event whose scheduled span overlaps Today**, using half-open intervals: `starts_at < tomorrow at 00:00 UTC && ends_at > today at 00:00 UTC`. An event ending exactly at today’s midnight does not overlap Today. Keep the actual start-date label on an overnight event (for example, `Started yesterday · 23:30 UTC`); do not relabel its kickoff as today. An overnight event that is currently live remains in Today and its Live filter even when it began yesterday. Deduplicate it by URI within each selection as usual. Do not relocalize into a browser zone. Use locale-aware formatting with `timeZone: 'UTC'`.

Default to today. An absent date, malformed format, impossible date or repeated date query falls back to today with a visible notice: “Showing today in UTC. Choose a date from the schedule.” A valid date outside the loaded schedule remains a valid empty selection; do not silently redirect it to another date. Persist the existing `filter` query when changing dates, and persist `date` when changing All/Live/Upcoming; canonical host behavior remains unchanged.

Offer date links only for dates represented in the loaded schedule, not a generated calendar. Today remains the default and a recovery link even when absent from that schedule; it is not advertised as a populated date. Selected links have an explicit current state and visible overflow. A day without entries has a Today/clear-filter escape. Unknown-time and 24/7 groups are separately labelled undated listings, not evidence that the selected day has scheduled events. Archive remains at `/vods`; choosing yesterday must not invent replay availability or fetch unsupported history.

### Directory banner eligibility

For existing directory banner placements, insert a banner only after the **first populated group**, and only when that group has **three or more unique visible cards** after date/status filtering and URI deduplication. A promoted card counts once as part of its own group. Never insert a banner between that entry and the rest of its group. If the first populated group has one or two cards, omit the directory banner for that selection; a later larger group does not make it eligible. Render nothing before an empty selection, including no empty banner reservation. Once eligible, retain the fixed slot dimensions whether the creative loads or is blocked. This does not add category/replay placements. The event banner remains below the player and its source controls under decision 22.

### Game sheet becomes an event URL

Use a normal page with browser Back, direct links and readable breadcrumbs, not a simulated native sheet. Event identity/time leads into the existing reserved player area. The active source remains next to the frame; alternatives and their real link/embed type follow, with Shield/fullscreen/help only where relevant. Put the fixed banner **below the player and its controls**. Available source information is our equivalent of dense game detail. Box score, lineup, stats and play-by-play are absent, so no empty tabs or implied support.

An event listing links to our event page, which links out to or frames a third-party player. kwip hosts no game media. Do not flatten this into “every event opens an external site”: `sources[].type` determines the behavior. Preserve native no-JavaScript source fallback, ad-blocker behavior, recovery, source ordering and health logic. The visual pass does not change the click-under policy.

### Event states: message, controls and recovery

These states keep the event heading, actual date/time and reserved player geometry. Upcoming and ended are schedule states, not source failures. A failed fetch still uses the separate error/Retry treatment; authoritative missing event data or no usable sources uses unavailable. An ended event uses the ended treatment even when its live sources have disappeared.

| State | Message in the player area | Source-control visibility | Recovery action |
|---|---|---|---|
| Upcoming | `This event starts at {time} UTC on {date}.` Use the actual scheduled start, with the date visible. | Hide source health, failed-source badges, source switching, launch actions, Shield and fullscreen; do not mount a player or imply a source has failed before kickoff. | `Browse live events` links to Today’s Live selection. Re-evaluate availability at kickoff without promising that a source will be ready. |
| Unavailable | `No source is available for this event.` For an authoritative missing listing, use `This event is no longer listed.` | Hide source picker, health indicators and player-only controls when there are no usable choices. If a retryable source failure still has alternatives, keep those alternatives and their existing recovery controls instead of treating the whole event as unavailable. | `Open {alternative event name}` offers the nearest currently live scheduled alternative: same category first, smallest absolute start-time distance from this event, then viewers descending and URI. If this event has no start, choose the most recently started live event. If none exists in-category, use the same rule across categories; if none is live, show `Browse current events`. Never link back to this event. |
| Ended | `This event has ended.` | Hide live-source switching, live-source health, launch actions, Shield and fullscreen; do not keep presenting a live player. Replay controls belong to the replay page. | Keep `Watch replay` linking to the matching replay wherever one actually exists. Otherwise show `Browse current events`; never invent a replay link. |

`Browse live events` targets `/?date={today in UTC}&filter=live`; `Browse current events` targets `/?date={today in UTC}`. Use only loaded, non-stale scheduled live listings for the nearest-live recommendation; if current availability is unconfirmed, use the browse escape instead of claiming an alternative is live. Announce state changes accessibly and preserve focus when controls disappear.

## Page inventory

All treatments below are proposed visual refinements within existing hero, rail, grid and player geometry. Shared anatomy means consistent art, numeral and label hierarchy, not one imposed screen layout.

| Surface | Intended treatment |
|---|---|
| Home `/` | Quiet shell; UTC date strip and persistent status filters; live, upcoming, unknown time, 24/7, ended in the defined order. Banner only after the first populated group if it contains at least three unique visible cards. Keep the poster hero, next-up strip and rails; no repeated promoted entry. |
| Category `/c/<category>` | Same timing anchor and card anatomy, scoped title and date/status controls; retain the responsive card grid and poster recognition. Keep category and Home exits. |
| Event/player `/live/<uri>` | Larger identity/time header, reserved player, adjacent selected source and alternatives when usable, local help; banner after player controls, related events afterward. Upcoming, unavailable and ended use the explicit message/control/recovery table above in the same player geometry; preserve a real replay link after the event ends. |
| Archive `/vods` | Same recognition grammar with replay label and event date; preserve league grouping and actual archive filtering. Existing archive banner follows the first populated group only if it contains at least three unique visible cards; otherwise omit it. Never masquerades as a replay. |
| Replay `/vods/<slug>` | Match identity and real date, then supported third-party playback/link treatment. No invented result. Existing playlist `<video>` branch is a separate playback-policy question; this audit does not remove it or authorize a new native player. No new banner placement. |
| Stale, across routes | Keep known listings and local Refresh with last-update context; every affected card qualifies availability. No fresh-looking Live urgency or moving progress. Alerting is separate from this UI. |
| Empty, date/filter/category/archive | Keep heading and controls; say what selection is empty, offer Today/current events or a clear-filter escape. No illustration that displaces recovery. |
| Error, feed or event | Keep heading/navigation and plain Retry. Distinguish failed fetch from authoritative unavailable event; source failure offers another source, not a page-level dead end. |
| Loading | Skeleton follows retained hero, rail, card and player geometry with reserved art and time blocks. Loading indicators do not announce changing decorative content. |
| Dark | Default per decision 12; existing dark Touchline canvas/surfaces, bounded visible event tint, readable opaque ink and mint focus. |
| Light | Existing light Touchline surfaces/ink; separately bounded tint so card labels, dividers and selected controls remain legible. Same hierarchy, content and controls. |

About/mirrors and shell navigation inherit typography/focus discipline; no content rewrite or new routes are proposed there. Canonical links and absolute `og:url` remain on the configured canonical host; mirrors never become internal destinations.

## Constraint table and acceptance evidence

These are acceptance criteria, not measurements from this task.

| Constraint | Required behavior | Evidence before implementation ships |
|---|---|---|
| Tinted text | Use the validated one/two-seed field pipeline above, 35% listing / 50% hero-detail colour; both `fg` and `muted` must reach ≥4.5:1 or reject tint for `surface`. Meaningful controls/focus ≥3:1 against adjacent surfaces. No colour-only status/selection. | Measure composite backgrounds for both themes, normal/hover/selected/focus, shorthand/long hex, invalid and missing seeds, clamp boundaries, interpolated field colours and neutral fallback. Test without colour. |
| CLS and numerals | Reserve art, crest/fallback if ever supported, timing column, player and banner geometry. Tabular numerals plus enough width for locale/timezone prevent ticking or hydration shifts. | Slow/failed artwork, SSR→hydration and clock-boundary capture; aim for CLS 0 from these elements, total ≤0.1. Recheck 200% text without rigid clipping. |
| Banner position | Event banner stays below player and source controls. Existing directory slots appear only after the first populated group with ≥3 unique visible cards; omit if that first group has <3. Never split a promoted entry from its group or precede an empty selection. Eligible slots stay fixed: desktop 970×90, mobile 320×100. | Check first-group counts 0/1/2/3, duplicate URIs, promotion, filtered results and a later larger group; ad on/off/blocked at mobile/desktop. No automatic advertiser navigation on home. |
| Card geometry | Retain hero, rails and responsive grids. Preserve existing poster geometry on mobile and desktop, token radii/insets and ≥44 px targets. Time: 2.25rem card / 3.5rem hero-detail, weight 850, tabular lining numerals, ≥5ch growing width. Timing/state wraps; name clamps at two lines with full accessible name. | Capture 320/390/768/1280 px, rail overflow, long labels, locale times, absent/failed art and 200% text in both densities. Confirm no forced scoreboard columns or hidden mobile art. |
| Ordering and dates | URI dedupe; live/viewers, upcoming/start, unknown/name, 24/7, ended/newest. `?date=YYYY-MM-DD` uses UTC start-date membership plus span-overlap membership for Today, retaining actual start-date labels and overnight live events in Today/Live. Status query persists. Missing/invalid date gives Today plus visible notice; valid unloaded dates are empty. | Check UTC midnight, exact-midnight end, overnight live in Today/Live, actual kickoff label, repeated/impossible/absent dates, valid unloaded date, query persistence, tie-breakers, duplicates and promoted entry appearing once. |
| Event states | Upcoming shows actual start and hides source health/launch controls; unavailable offers a nearest live alternative or browse escape; ended hides live controls and retains a real replay link. Follow the message/control/recovery table. | Inspect each state, ended with/without replay, unavailable with/without live alternatives, stale alternatives, retryable source failure, kickoff transition and focus after control removal. |
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
| How literal should the match card be? | A: intact name plus prominent time/state; B: symmetrical opponent/crest card; C: retained poster/card structure with the reference’s numeral, ground and label treatment. | **C, revised: art-led stream card with large time, inset ground and label hierarchy, inside the retained hero/rails. Supersedes A.** B is worth a separate verified-data proposal; title splitting alone cannot establish opponents or crests. |
| How much colour? | A: neutral Touchline throughout; B: bounded poster-seed tint; C: inferred team colours or sampled imagery. | **B with A fallback**, using the revised surface-specific bounds and whole-field contrast gate. Neutral lists and stronger detail fields both appear in the supplied images. C adds unreliable identity and runtime complexity. |
| What occupies the top? | A: scheduled live then earliest upcoming; B: current popular feature/24/7 hierarchy; C: locally saved favourites. | **A within the retained hero and rails.** Immediate useful defaults require no setup/storage. Keep popularity only within live initially. B hides the nearest event; C is outside v1. |

## Follow-through and open questions

This audit recommends a direction; it does not supersede DECISIONS.md or rewrite DESIGN.md. Only the orchestrator may record binding decision changes. Before implementation, reconcile selection/date semantics with SPEC.md and the design work order.

1. **Card/time prototype:** future changes in `theme.css` and `StreamCard.vue`; compare missing art, unknown time, long event name and 24/7 in both themes. Reject any design that requires invented opponents or a score.
2. **Directory composition:** future changes in `index.vue`, `c/[category].vue`, `vods/index.vue` and shared rails. Retain the hero, next-up strip, rails and grids; apply the UTC `date` query contract, defined group ordering, URI deduplication and first-group banner threshold, then prove date/status combinations and honest empty states.
3. **Detail continuity:** future changes in `live/[...uri].vue` and `vods/[slug].vue` only for presentation. Verify source focus, fallback, upcoming/end/stale states and banner position before accepting visual parity.
4. **Acceptance gate:** fresh 390×850 and 1280×850 captures in both themes and densities for home, category, event, loaded player, archive, replay, empty, stale and error; add 320 px/200% text, keyboard, reduced motion, no-JavaScript, bad artwork and ad-blocker cases. Run the repo build/test/dry-run and applicable browser tests. No visual score or performance claim follows from a source detector alone.

49b supersedes the earlier board-layout recommendation and its fixed two-column/trailing-desktop-art geometry. Ordering, URI deduplication, UTC date/query behavior, first-group banner eligibility and event-state recovery remain. The historical critique score is not recalculated; this is a docs-only reference correction, not implemented visual behavior.

Open questions for the next brief:

- Is genuine opponent/crest data planned? A verified resolver proposal is worthwhile given the reference, but until a feed contract exists retain the actual poster, intact name and time/state; no title splitting or extra asset service.
- How should the existing playlist replay branch reconcile with the documented no-native-player constraint? Keep that policy decision separate from visual work.

Questions skipped in chat: this brief explicitly requests documented options and open questions, with no implementation in this task.

## Verification

49b changes only `docs/redesign-49a.md`; no application code, assets, dependencies or `package.json` changes. The five supplied screenshots were inspected with the image tool. No local browser or measured visual/contrast validation was performed: the geometry, colour and accessibility acceptance criteria above remain implementation gates. Historical 49a check results do not validate this revision.

Fresh 49b results: Logs: `/tmp/49b-build.log`, `/tmp/49b-test.log`, `/tmp/49b-dry.log`. These check the unchanged application baseline and document whitespace, not the proposed visual behavior.

- `pnpm build`: passed, exit 0.
- `pnpm test`: passed, exit 0; 144 tests, zero failures.
- `pnpm exec wrangler deploy --dry-run --outdir /tmp/kwip49b-dry`: passed, exit 0; no production deployment.
- `git diff --check`: passed, exit 0.

Read-only review against the brief and five screenshots found one leftover board reference; it was corrected to retained cards. The Web Interface Guidelines fetch returned HTTP 503; no fresh guidelines compliance claim is made.

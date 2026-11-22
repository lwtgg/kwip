# kwip redesign · 45a

## Rendered audit

The owner brief supplied the product facts for Impeccable init. The incumbent broadcast treatment is the anti-reference. kwip is an Operate surface: a fan should be able to identify the game, its availability, and the next action in five seconds.

Built the branch and served it with the existing local Worker fixture harness. The capture matrix uses 390 × 850 and 1280 × 850 viewports, each in dark and light. It covers home, the live window (`/?filter=live`), event, loaded player, archive, replay detail, populated Basketball, empty Tennis, stale home, and feed-error home. The listing clock is rebased for live and upcoming examples. The stale and error responses are controlled fixture inputs. One poster is a stand-in, with missing posters exercising the real fallback. The player frame shows local fixture content, so its inner styling and playback reliability are outside this audit.

Captures live at `/tmp/kwip45-shots/{home,live-window,event,player,vods,replay,category,empty,stale,error}-{390,1280}-{dark,light}.png`. The capture manifest and measurements are in `/tmp/kwip45-shots/results.json`. The repository house creative appears on the routes and states that render the slot. Categories, replay detail and the no-data error branch have no banner placement. The fixture harness opts in locally with its own config. All 40 fixture captures measured CLS 0. The 24 captures with a banner successfully loaded the creative. The project and production ad flag were untouched.

### Findings

Impeccable’s source detector and rendered dark scans found zero primary issues and one advisory. The home repeating gradient was traced to the feature texture in `app/assets/css/theme.css`. Detector output is in `/tmp/kwip45-shots/impeccable-source.json`, `/tmp/kwip45-shots/detector-390x844.json` and `/tmp/kwip45-shots/detector-1280x850.json`.

The counts are distinct findings, with repeated instances grouped by treatment. U-numbers refer to the unslop-ui rules. Priorities use Impeccable’s scale from P0 (blocking) to P3 (cosmetic).

| Category | Count |
|---|---:|
| Surface and color | 2 |
| Typography | 3 |
| Layout and interaction | 5 |
| Copy and chrome | 6 |
| States and recovery | 3 |
| **Total** | **19** |

- **Surface · P2** — Home hero and shared shell use scanline texture, exposed edge rules and precise little corners across surfaces. The texture gives interface chrome some of the visual weight that should belong to the event.
- **Surface · P2** — The featured edge, watched-window fill, CTA and red live markers compete for emphasis on the live window. The edge carries real selection state (U24). Carry the state forward as text and confine the accent to the next action.
- **Type · P1** — Home, category, event and archive force event names into condensed uppercase. Long team names are harder to distinguish in the mobile stack. Use sentence-case SF with wrap and size doing the hierarchy.
- **Type · P2** — Rail headings and “NEXT UP” borrow the same compressed display treatment, and small status labels add tracking. Both levels need to scan independently of match titles.
- **Type · P3** — Home hero “1.7k watching,” live tile “● 1.7k,” event “1,737 viewers,” and archive “4.1k views” use different roles and spacing. Preserve live versus historical meaning and the useful compact/exact distinction. Give all comparable numbers the same tabular SF style.
- **Layout · P1** — Home at 390 uses a large image above the matchup and sends other live choices below the spotlight and banner. On the live filter, the only live event is repeated immediately afterward. Reuse the one featured entry as the first scannable row or tile.
- **Layout · P2** — At 1280 the archive and sparse live rails occupy the full width for a single narrow item. The title and far-right rail link become harder to associate. Give headings, items and navigation a common reading edge.
- **Interaction · P1** — Event page source choices, Shield, fullscreen and help read as one decision ahead of the frame. Selected source is distinguished mainly by a subtle underline and border. Give the current source a stable home directly against the player and group secondary actions.
- **Interaction · P1** — Shared header at 390 clips sport links with little indication of what can scroll. Archive discovery is footer-dependent on the routes reviewed. Preserve both reachable paths and show the overflow affordance.
- **Interaction · P1** — At 1280, Shield, fullscreen and help measure 32 px high and category filters measure 28 px. The brief calls for 44 px. Give the hit areas their own minimum size even in compact mode.
- **Chrome · P2** — Hero metadata and archive poster overlays use eyebrow and badge styling (U1/U9). Keep feed-backed category and availability, and drop the generic archive “EVENT” marker from the visual hierarchy.
- **Chrome · P2** — Shared live badges use both a dot and uppercase text, while the card viewer count uses a similar dot for a different fact (U10). Live is real, and the count is data. Reserve a direct label for each role.
- **Copy · P2** — Hero, cards and event pages chain category, league and viewers with separators (U6). Keep timing or availability closest to the event name and place supporting facts where they help a choice.
- **Copy · P2** — Event picker can show identical host lines twice per source when the raw and displayed hints coincide (visible in the local fixture’s DOM text). Keep the host once when it helps tell destinations apart. Check with real long hostnames.
- **Copy · P3** — Category rails split destination cues across a title arrow and a generic “View all (1),” while related events append an arrow to “More Basketball” (U21/U22). Use one consistently placed, destination-specific cue.
- **Copy · P3** — Event breadcrumb repeats the full matchup immediately above its heading (U7). Keep usable hierarchy and current location semantics with the visual weight on the title.
- **State · P1** — Stale home says data is older than five minutes although `useFeedFreshness.ts` triggers at 20. It then shows an unqualified live presentation. Put freshness beside availability and align the wording with the actual freshness rule.
- **State · P2** — Empty Tennis names the missing content but leaves the next action to the header (U4). Its hourglass resembles loading. Give the visitor a direct route back to current listings.
- **State · P2** — Home feed error shows an upstream-provided message above Retry (U4). Keep Retry and explain the failure in directory terms. Distinguish feed failure, empty results and source failure.

Keep the state-driven Live, Upcoming and 24/7 distinctions, actual event names, direct navigation, timing and source type cues. Shield text explains a real consequence. The advertisement label is identification. Breadcrumb separators and outbound indicators tell the reader where they are going. The fallback monogram helps recognition and keeps geometry intact. Decorative numbering, hype slogans, emoji navigation, ornamental gradients or glows, glass, novelty badges, chart chrome and parallax were absent. The poster fallback gradient is functional.

### Impeccable critique

**25/40 · Acceptable.** The scores describe usability. The requested redesign replaces the visual system.

| Heuristic | Score / 4 | Rendered evidence |
|---|---:|---|
| Visibility of status | 3 | Live, countdown and refresh are visible. Selected source and stale availability need clearer hierarchy. |
| Match with real world | 3 | Sport, game and replay names make sense. Generic “EVENT” and provider terms make scanning slower. |
| User control and freedom | 3 | Breadcrumbs, filters and source switches work as exits. The empty panel lacks its own path out. |
| Consistency and standards | 2 | Sharp listings, rounded tools and several status/count treatments read as different systems. |
| Error prevention | 3 | Distinct embedded and outbound choices and an identified ad help prevent mistakes. The active source needs a stronger cue. |
| Recognition over recall | 2 | Clipped categories, utility icons and footer archive discovery make secondary paths easy to miss. |
| Flexibility and efficiency | 3 | Direct CTA, density and filters offer speed. Mobile discovery beyond the feature costs scrolling. |
| Aesthetic and minimalist design | 2 | Condensed titles and stacked poster/status/edge treatments compete with event identity. |
| Error recognition and recovery | 2 | Refresh and Retry help. Empty results lack a next step and the feed error can leak raw provider copy. |
| Help and documentation | 2 | Shield and player help are local to the task. The visual question mark is hard to discover. |

**Cognitive load, 5 of 8 checks fail.** Single focus, chunking, hierarchy, one decision at a time and minimal choices fail at the home spotlight or the six-choice player toolbar. Grouping, working memory and progressive disclosure pass narrowly. Event context stays above the frame, listings have named groups, and player help can expand on demand. Identifying a game and choosing a source are intrinsic tasks. Comparing repeated chrome and locating the toolbar’s current choice are extra work. Consistent cues for selected filters and sources can help a returning visitor learn the interface.

- **Fan in a hurry on a phone:** The featured match is identifiable. A different match takes scrolling past the feature and banner.
- **Keyboard regular:** Breadcrumbs and filters are recognizable. The category rail and density control are less discoverable than the data they govern.
- **Fan on weak signal:** The monogram and Retry preserve a way forward. A stale live marker and visually equal source alternatives make it harder to know what is still actionable.

## Direction A · Fixture list

- **Product.** Find the match, confirm its window, and open the source.
- **Character.** Calm, direct, orderly.
- **World.** A matchday schedule with a fixed place for the time and a generous line for the teams.
- **Moments.** First scan of live matches, followed by confirmation of the active source at the player.
- **Signature.** A left-aligned tabular time or status column paired with a sentence-case matchup and one action.

**Home and event.** Home starts with the existing featured match as the first listing, with a small optional poster on the trailing edge. Live, upcoming and 24/7 groups share left and right edges and keep their real filters. Category pages share the same row grammar, the archive trades time-to-start for replay date, and empty and error states occupy the same reading column. Event detail uses a larger matchup title and a single player surface. The selected source sits on the player edge with alternatives and help nearby in a lower-weight group. The event banner sits underneath the player. On mobile, a first scan should show the featured match and the next eligible row when data permits.

**Color and surfaces.** The proposed Touchline ramp uses these roles, dark/light respectively.

| Token role | Dark | Light |
|---|---|---|
| Canvas | `#11161A` | `#F5F8F5` |
| Surface | `#19211E` | `#FFFFFF` |
| Raised | `#232E2A` | `#E4EDE7` |
| Ink | `#EDF5F0` | `#15251E` |
| Muted | `#A9B8B1` | `#4C6056` |
| Divider | `#36483F` | `#CEDBD2` |
| Control edge | `#647B70` | `#71877B` |
| Action and focus | `#73E4B0` | `#086347` |
| On action | `#11161A` | `#FFFFFF` |

**Type and geometry.** SF Text intent at 13/18 500 for timing, 15/22 400 for supporting copy and 17/24 600 for event rows. SF Display intent at 22/28 600 for section titles and 28/34 650 for event detail. Weight numbers describe CSS roles, with platform fallback allowed to resolve to the nearest available weight. Use a 4/8/12/16/24/32 px spacing scale, 8 px controls and 12 px player and panels. Lists share a neutral 1 px rule between groups or rows. Canvas and surface tone do most of the work. Use a single `0 6px 20px rgb(0 0 0 / 0.14)` shadow token for transient overlays.

**Bright element.** Use the filled mint-green action for the featured live entry on home and the actionable source or recovery action on detail. Once an iframe is active, its picture gets the attention and the source selection can use a quiet outline and text. Optional posters add recognition and can disappear without changing alignment.

**Risk.** The list can feel too utilitarian, and a rigid status column can squeeze long names. Use a bounded desktop column and allow timing to move above the title at narrow widths while keeping the action within the same row.

## Direction B · Event tiles

- **Product.** Recognize the event from its name and artwork, then see which source is open.
- **Character.** Clear, warm, composed.
- **World.** A matchday program where event images live inside reusable tiles with a consistent caption area.
- **Moments.** The first live tile and the source confirmation at the player.
- **Signature.** A single lead tile with a fixed media well and a caption that works with a poster or monogram.

**Home and event.** Home opens with the actual featured matchup in a shallow horizontal tile at 390 and an asymmetric lead tile next to a compact next-up column at 1280. Other events use the same caption and status alignment, with archive dates in the timing position. Compact mode can shrink supporting tiles into thumbnail rows. Category and archive align to the same grid; stale and error messages span the reading column with a plain action. Detail moves the emphasis from poster art to a single broad player panel with grouped source controls, and its banner below the panel.

**Color and surfaces.** The proposed Dusk ramp uses these roles, dark/light respectively.

| Token role | Dark | Light |
|---|---|---|
| Canvas | `#161B27` | `#F4F5FA` |
| Surface | `#202638` | `#FFFFFF` |
| Raised | `#2A3042` | `#E8ECF8` |
| Ink | `#F1F3FA` | `#20283D` |
| Muted | `#B5BDD3` | `#505C77` |
| Divider | `#3B4662` | `#D4DBEE` |
| Control edge | `#7281AB` | `#7584AE` |
| Action and focus | `#B9C8FF` | `#394C9F` |
| On action | `#161B27` | `#FFFFFF` |

**Type and geometry.** SF Text intent at 13/18 500 for labels, 15/22 400 for support and 16/22 600 for tile captions. SF Display intent at 22/28 600 for sections, 28/34 650 for mobile lead and 34/40 650 for desktop lead and event detail. Spacing tokens are 4/8/12/16/24/32 px. Use 10 px controls and 16 px outer tiles and player panels, with inner media radius derived from inset. Separate ordinary tiles with surface tone and space. A 1 px neutral rule groups source controls and state messages. Use `0 8px 24px rgb(0 0 0 / 0.16)` for the lead panel or a transient overlay.

**Bright element.** The lead poster is the color moment when available. Caption text and action sit on a stable, opaque surface. If the poster is missing, a neutral monogram preserves the slot and the indigo action takes over as the bright element. In event detail the player takes the visual lead, or the action does when the frame cannot be opened.

**Risk.** Uneven third-party photography can dominate the hierarchy, and the lead tile can reduce the number of events visible on a phone. Set a strict maximum height on the mobile media well and test with missing, slow and unusually bright images.

## Constraints for the next pass

Both use `-apple-system, BlinkMacSystemFont, system-ui, "SF Pro Text", sans-serif`. Use `font-optical-sizing: auto` where supported. The Text and Display labels above describe the intended optical treatment at the specified sizes. System font and optical behavior depend on platform and browser. Use tabular numerals for comparing times and counts. Existing color role names, where semantically appropriate, remain the token API. Proposed values belong in `app/assets/css/theme.css` only after direction sign-off. [Owner’s SFWindows reference](https://github.com/bradleyhodges/SFWindows) · [Apple’s SF Pro specimen and optical sizing](https://developer.apple.com/fonts/).

| Constraint | Fixture list | Event tiles |
|---|---|---|
| Reserved ad below the player | Keep existing fixed banner sizes and position below the player. | Keep the same reservation outside the player panel. |
| Density | 60/76 px nominal compact/comfortable match rows, with room to grow for wrapped names. | 64 px thumbnail rows in compact and 112 px nominal supporting tiles in comfortable. Lead and player geometry stay stable. |
| CLS 0 | Reserve poster, toolbar, iframe and banner boxes at SSR. Match fallback and loaded dimensions. | Reserve media wells and caption space. Keep the same aspect allocation on missing art and during hydration. |
| AA contrast | Muted on raised 6.80:1 dark / 5.64:1 light. Action text 11.66:1 / 7.28:1. | Muted on raised 6.99:1 dark / 5.67:1 light. Action text 10.46:1 / 7.75:1. |
| Visible focus and 44 px targets | Use a 2 px outline with a 2 px offset and a 44 × 44 px minimum target in both densities. Check saturated states and rail clipping. | Same outline and hit area. Keep focus outside cropped media and verify borders around selected controls. |
| Reduced motion | Instant density and source states with reduced motion. Status text and geometry carry meaning. | Same, including artwork and failure transitions. |
| Native fallback | Preserve the labelled `noscript` select with a submit path and supported source URL. | Same select inside the source panel’s geometry. |
| Missing posters | Title and match time remain in the shared columns. Use a small neutral thumbnail fallback when useful. | Keep a neutral monogram in the reserved media well. Keep title and state independently readable. |
| Dependencies, media and tokens | System typography, centralized tokens, current third-party iframe/link paths. No new dependency, proxy or native video. | Same. Preserve poster hotlinks and the current outbound vs. embedded distinction. |

The contrast ratios above are for proposed pairs. The control edge against Raised also clears 3:1 for both themes in both directions. Use that edge on controls whose boundaries carry meaning. Before implementation ships, verify all text, hover, focus, control and state combinations in a browser, with both densities and themes. The current replay detail contains a conditional native `<video>` for playlist sources. Both proposals add no native video. Applying the no-`<video>` constraint to that existing branch requires a playback decision independent of the visual direction.

## Recommendation and owner decisions

Choose **Fixture list**. It gives live and upcoming events a predictable position before a poster loads, keeps more game names within the mobile scan, and gives source selection a stable location beside playback. Event tiles is viable if poster recognition is a deliberate priority and the height of the feature can be held to a tight cap.

1. Approve Fixture list or Event tiles as the sole visual system for the next pass.
2. Choose how much space the existing featured match gets on mobile. For Fixture list, use the normal listing geometry with one prominent action.
3. Approve the selected-source treatment. Keep identity adjacent to the frame, with alternative sources visible and player help given less visual weight.
4. Decide the scope of the existing playlist replay branch. If native video must be removed across the archive, agree on the supported fallback before changing playback behavior.

For 45a, `pnpm build`, `pnpm test` (137 passing), and `pnpm exec wrangler deploy --dry-run --outdir /tmp/kwip45-dry` passed.

The final verification for either direction is the same capture matrix plus compact density, keyboard and focus order, slow/failed artwork, stale refresh, no JavaScript, and the existing banner and source browser tests.

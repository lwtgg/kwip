# Brief — task 50b: dated listings, one row per event, event identity

Home pushes 210 rows in 10 category rails and the same event can legitimately be filed under more than one category.
There is no way to ask for a particular day, and the event page identifies a match only by the `name` string.

Two facts measured on the live 58 feed (210 rows, `/api/feed/streams`, 24 Nov 2026): there are **no** duplicate
`uri_name`s and **no** duplicated matchups today, so the dedupe below is defensive rather than a cleanup, and the
category rails stay where they are. The date work is the substance.

Owner's decisions: a date **filters** the page with its own crawlable URL, and the list below the hero is one row
per event, earliest kickoff first.

## 1. The date strip

- A horizontal strip of the next eight UTC days, starting today, above the listing and below the status filter.
  Each chip: weekday and day number (`Today`, `Wed 26`), the number of listed events that day, and a visible
  selected state.
- Every chip is a link to the same page with `?date=YYYY-MM-DD`; `Today` is the bare path. Compose with the
  existing `filter` query — changing one keeps the other. Keep `?filter` behaviour exactly as it is now.
- Only dates that carry at least one event are rendered. If the strip is empty (nothing listed in eight days) it is
  not rendered at all.
- The selected day is a real, shareable page: `activeDate` comes from the query, validated strictly
  (`^\d{4}-\d{2}-\d{2}$`, a real calendar date, within today..today+7 UTC). An invalid or out-of-range value is
  ignored and the page behaves as the undated home; it never 404s and never renders `Invalid Date`.
- Selection is UTC, matching every other date label on the site (`CardTiming` formats `UTC`).
- Hero, Next up, Live now, 24/7, category rails and Upcoming all honour the selected date: a dated page shows only
  events whose `starts_at` falls on that UTC day. Live events whose window spans the day are included on the day
  they start. A dated page with the `live` filter and nothing live on that day is its own empty state and says so.
- Strip overflow: at 320 px it scrolls horizontally with its own scroll container, no page overflow, chips keep a
  44 px target, and the strip is reachable and operable by keyboard (`aria-current` on the selected chip, scroll
  the selected chip into view on load without moving the page).

## 2. SEO for a dated page

- `canonical` is self-referential and absolute on the canonical host for a valid date, including `filter` only when
  it is not `all`: `https://host/?date=…` and `https://host/?filter=live&date=…`. The undated page keeps today's
  canonical. `og:url` follows the canonical. Mirrors are still never linked.
- Title and description name the day (`Live sports events on Wed 26 Nov 2026`) and stay distinct per date and per
  filter; the description still says the directory is ad-supported. `h1` does not change on a date.
- Add dated URLs with events to the sitemap for the current eight-day window; do not add empty or invalid ones.
  Confirm the sitemap and canonical agree and that `robots` is unchanged.

## 3. One row per event, earliest kickoff first

- Dedupe the list below the hero by event identity before ordering: `id` when present, otherwise the normalised
  category-agnostic `uri_name`. When the same event appears twice, keep the copy from the rail/block that would
  render highest and show its category as a label on the row, so nothing is lost by the merge.
- Ordering of `row-list` / `row-grid` content: live first, by viewers descending; then upcoming, by `starts_at`
  ascending; then ended. Never interleave the three.
- The hero is chosen from the *dated and filtered* set, not the whole feed, so a dated page's hero belongs to that
  day. Keep the existing hero tier order (live with an embed, viewers, 24/7, kickoff).
- Category rails keep their grouping but skip any row already rendered above them, so the page never shows the same
  event twice. Measure the row count before and after on a real capture and record both.
- Add a unit test for the dedupe/order function with the three states, a duplicated event across two categories and
  a missing `id`; it must be pure and not touch the DOM.

## 4. Event page identity

The event page identifies a match with the truncated `name` string only. Give it a real identity block above the
player, for matched events: both teams (crest or initials, name, score), the state and detail line, kickoff/stale
via the existing `StatusPill` and `LiveProgress`, viewers, and the category chip. Reuse the banner's computed
content (`matchBannerContent`) rather than writing a second label path so the accessible name stays identical to
the card's, and reuse `useCardTint` for the field. One `h1` stays the event name in the block, unclamped.

- Unmatched and 24/7 events keep the current heading block, unchanged.
- The block must not push the player below the fold at 390×844 for a matched event (measure the player top) and
  must not overflow at 320 or at 200 % text.
- No new requests: crest or initials from what the card already has.

## 5. Tests

- Strip renders only days with events, `aria-current` on exactly one, keyboard reachable, no overflow at 320.
- `?date=` valid filters the whole page; invalid, out of range and non-calendar strings degrade to the undated page
  with a 200.
- Canonical/`og:url`/title per date and per `filter`; sitemap contains the dated URLs with events and no empty ones.
- Ordering: live before upcoming before ended; viewers desc within live; `starts_at` asc within upcoming; no event
  twice on the page (collect every `a[href^="/live/"]` and assert uniqueness), including across rails.
- Hero belongs to the selected date.
- Event identity block: teams, score and viewers present for a matched event, absent for 24/7, accessible name
  matches the card's, player top above the fold at 390×844, no overflow at 200 %.
- Red controls: remove the dedupe and show the double-row assertion fail; drop the date filter from the hero
  selection and show a hero from the wrong day.

## 6. Gate

`pnpm test`, `pnpm build`, `NITRO_PRESET=node-server pnpm build`, default rebuild, `pnpm exec wrangler deploy
--dry-run`, every suite at 320/390/1024/1280 (`cards`, `banner`, `density`, `notLive`, `click_under`,
`generation_first`, `top_event`, `sourceHealth` seeded). Never build while a Worker serves. Commit, do not deploy,
do not touch `.prompts` or `DECISIONS.md`. Record the measurements and the before/after row counts in
`docs/redesign-50b.md`.

# Task 10 — live site QA

Read-only report. Do not change files.

The site is deployed at `https://kwip.fyi`. Treat it as a stranger's site: judge what a first-time visitor gets, page by page.

## Tools

- Local DNS on this machine does not resolve `kwip.fyi` for curl/Node. Use `--resolve kwip.fyi:443:104.21.69.111` on every curl (and `--resolve kwip.lol:443:104.21.71.122` for the mirror).
- Orca's browser works normally. A page is already open: `browserPageId 628670f2-3997-4b48-80ca-80848cc378c3`. Drive it with `orca goto --page <id> --url …`, `orca snapshot`, `orca eval --page <id> --expression '…' --json`, `orca console`, `orca network`, `orca viewport --page <id> --width 390 --height 844 --mobile`. Read page text with `orca exec --page <id> --command "read"`.
- Fixtures are the data source: `https://kwip.fyi/fixtures/streams.json`, `stream.json`, `vods.json`, `vod.json`.

## Check

1. **Does the front page earn a click?** Hero, cards, posters, status wording, freshness banner. Count images and check `naturalWidth` on each; check every `/fixtures/*.jpg` status.
2. **Time correctness.** Fixture `starts_at`/`ends_at` against the real clock: what does each card claim, and is the hero's state claim true? Which of `/`, `/c/basketball`, `?filter=live`, `?filter=upcoming` show what they should?
3. **Player.** `/live/football/ars-eve`: does the embed actually render in the frame (fixture text visible), does `?source=0` give an outbound CTA, does the select switch without a reload, does a bad source advance?
4. **VOD.** `/vods/hou-mia-full-replay`: `video.readyState`, whether it plays, whether the note matches the browser you are in, and the no-source/retry state.
5. **Theme.** Toggle, reload, cookie, flash of wrong theme, `data-theme` on first load.
6. **Mirror + SEO.** `kwip.lol` 301 including `www`, canonical and `og:url` on a mirror-served response, one `h1` per page, `sitemap.xml` hosts, `robots.txt`.
7. **Mobile.** 390px: ad format, tap targets, horizontal overflow, the source control, the category bar.
8. **Failures.** 404 page, `/live/basketball/does-not-exist`, `/vods/nope`, console errors, and whether any error state offers a working retry.
9. **A11y.** Names on iframes, select and buttons; focus order; keyboard reach on rails; `aria-pressed` on filters.

## Output

Numbered list: `url` + what a visitor sees, why it is wrong, severity (`broken` / `worse-than-nothing` / `polish`). Say plainly which parts are fine in one closing line. No praise section, no fixes.

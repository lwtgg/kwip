# Task 37: a house creative sized for the slot

The banner path is shipped and the flag is still off. The only creative we have is `house.webp` in `kwip-banners-prod`: the OG image, 1200×523. In a 970×90 desktop slot with `object-cover` it keeps a middle band and the text is unreadable; on the 320×100 mobile slot it is worse. That single file is the last thing standing between rule 22 and the flip.

Draw a leaderboard-shaped house banner that survives both crops, put it at the same path and alt so the creative key does not change, and leave it in both buckets.

Read `app/components/AdSlot.vue` (`object-cover`, the `Advertisement` chip at top-left, `loading="lazy"`), `app/assets/css/theme.css` (the banner tokens and the palette) and `.prompts/33-ad-flip.md` (section 3, step 4) first. Read `frontend-design` and `kwip-conventions`.

## The crop maths, which drive the layout

The slot renders 970×90 from `md` up and 320×100 below it, both `object-cover` on the centred box. At mobile the image is scaled to the 100 px height and the middle is all that shows: **only the centre 576 px of a 1940 px-wide source is visible**, full height. Everything that must be read goes inside a centred 576×180 safe zone. The outer flanks are decoration only, seen on desktop and never on mobile.

## Requirements

1. **Size and format.** 1940×180, so it is 2× the desktop slot. WebP, quality 82, metadata stripped, **70 KB or less**. Keep the filename `house.webp` and the exact alt `kwip is ad-supported: how our ads work`.
2. **Read inside the safe zone**, never outside it. Two lines at most, and it must still be legible at 970×90 (29 px and 18 px effective). Nothing critical in the left 682 px or right 682 px; nothing critical under the top-left `Advertisement` chip.
3. **Honest copy.** The banner is ours, on our own page. Say what it is without a count, an exclamation mark or "streaming", and let the second line be the reason to click: `How they work →`. The link goes to `/about#ads`, so the line must make sense there.
4. **Design against the tokens.** Use the palette's own values (`--color-bg`, `--color-fg`, `--color-accent`); the banner carries its own solid background so it reads under both themes, and the slot's `--radius` clips it. High contrast for the small line, AA at minimum.
5. **Reproducible source in the repo.** Put the HTML (or SVG) and a short render note with the exact commands at `scripts/banners/house.html`. No new dependency: Chromium for the screenshot and `cwebp` are both already on this machine.
6. **Do not break the click.** The creative key is `JSON.stringify([placement, image, alt, destination])` and `/go` 410s on a mismatch, so alt, path and destination stay exactly as they are.

## Verification

- Render both crops (970×90 and 320×100) from the real composition and confirm no glyph is cut and the small line is legible; report both as screenshots to `/tmp`.
- Put the file into `kwip-banners-preview` and serve it through a local Worker: `/banners/house.webp` returns 200 `image/webp`, and the byte length matches the file.
- Then upload to `kwip-banners-prod`, and prove it landed with `wrangler r2 object get --remote` (a silent no-op write has happened here before) plus the same byte length.
- `pnpm build`, `pnpm test`, `wrangler deploy --dry-run`, and the banner browser suite with the flag on.

Report the crop screenshots, the byte size, the contrast ratio of the small line, and the verification outputs. Do not deploy the Worker and leave the ads flag off.

# Fix round: 51 review, eleven defects

The review confirms the row exists at all three widths and fails on proportion and emphasis. Work through all
eleven in order, then re-measure. Do not renegotiate the row itself.

1. **Phone proportion.** Below md the row must be one name line plus one quiet line, and the progress bar must
   leave the lane's flow (give it its own placement, e.g. a bottom edge of the row, not a stacked band). Target
   a width:height ratio of 3.5:1 or wider at 320 and 390, comfortable and compact. Keep the plate; if the plate
   is what makes the row tall, shrink the plate below md rather than the text.
2. **The label must be readable.** Give the league label a full-width line of its own at the top of the row,
   metadata scale, one line, and drop the `tag` before truncating the sport name. "Basketball · NBA" and
   "Football · Champions League" must both print in full at 320. Measure the label's width at 320/390 and say
   what it is.
3. **Reserve the lane.** The floor is `minmax(floor, auto)`, so a long state widens it and reflows that row only.
   Set the floor from the widest state at each scale ("Time unavailable") and let states wrap inside it. Then
   measure the name column on a `Time unavailable` row against a normal row and show they are equal, at 320 in
   both themes.
4. **One heavy element.** The time is the only thing at weight 850 and full `text-fg`. The name goes to 400 at
   `text-fg`; `Watch` and the status go muted 400; the lane caption stays muted. Pluralise the viewer count
   properly (`1 viewer`, `2 viewers`) — it renders as "1 viewers" today.
5. **Condensed numerals.** `font-stretch: condensed` computes but the macOS system face ignores it. Keep the
   attempt, add a slight negative tracking token, drop the phone size one step, and state the fallback plainly
   in `docs/redesign-51.md` so nobody believes the numerals are condensed when they are not.
6. **Phone hero.** Label first, then name and lane side by side. There is an empty roughly 165×75 block above the
   label today; remove it. The hero must use the same arrangement logic as the rows, only larger.
7. **Hero name.** Allow three lines at detail scale instead of two, or remove the clamp there. "Cincinnati
   Bengals at Washington…" must be complete at 1280.
8. **Rail width.** 416 px rows leave the name 148 px and truncate about half the visible names. Widen md-and-up
   rail columns to about 30rem and take the lane down a step at row scale. Measure the name column again.
9. **Next up.** A single column at md and up, so no row is orphaned beside an empty cell.
10. **Six Colors.** Read <https://sixcolors.com/link/2024/04/the-poor-design-of-apple-sports/> and either quote
    it supporting the claim with the page marked as read, or remove the citation and the claim.
11. **The test.** The new row-height assertion (≤160 px) is too loose. Tighten it to the new target ratio so it
    would catch defect 1.

Then: the full screenshot matrix, contrast on the new canvas pairs, CLS at 390 and 1280 in both themes with
failed art, `noscript`, reduced motion, 320 px and 200 % text, and the full gate. Report the before and after
number for every measurement named above. Do not deploy; do not touch `.prompts` or `DECISIONS.md`.

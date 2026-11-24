# Task 49b: correct the audit against the owner's real reference and intent

Two corrections to `docs/redesign-49a.md`. The owner supplied actual app screenshots and clarified the
intent. Both override the document's guesses.

**Read the screenshots first** in `/tmp/kwip49-refs/` (PNGs; five files, the wide one is a marketing hero).
They are the reference: study the card build, the numeral treatment, the tint, the spacing, what is
emphasised and what is not. Any statement in 49a that contradicts them loses.

**The owner's intent, in their words:** they like the app's *design, UI, elements and everything*, but the
**streaming site's layout stays**. So this is the app's visual language carried onto our existing structure —
hero, rails, cards, event page with the player beside the frame — not the app's screen architecture. 49a's
recommendation A (intact name plus a prominent time, no art, no opponent identity) was written before the
screenshots and before that clarification; reconcile it.

## What to produce

Rewrite the affected sections of `docs/redesign-49a.md` rather than appending. Specifically:

1. **Card anatomy.** Take from the screenshots: the ground, the inset, the radius, the numeral weight and
   width, the spacing rhythm, the placement of the identifying art, the label stack. Say precisely which of
   it survives a card that is a stream listing (art, name, time, availability, watch action) and which does
   not. Where the screenshots show two crests, state what stands in for each crest when we have one name and
   one poster — and whether a crest pair is now worth resolving from the name, given it is the centre of the
   reference.
2. **Big numerals for the time.** The app's numbers are the loudest thing on the card. Our equivalent is the
   start time or the live clock. Set the scale, the tabular/width treatment, and the fallback when the time
   is unknown, and keep it honest: no invented clock.
3. **Tint.** Re-derive the bounds from the screenshots rather than the earlier guess: how strong the field
   is, how strong it is not, what it sits behind, and where the numbers sit relative to it.
4. **Our layout, on purpose.** State plainly what stays ours — the hero and rails, the card-as-link, the
   player page with the source at the frame edge, the banner below the player, the date strip as the spine —
   and what the reference contributes to each. Where the app's architecture would fight the streaming layout,
   the layout wins.
5. **Selection.** 49a's ordering (live, upcoming, unknown, 24/7, ended) stands unless the screenshots argue
   otherwise. Keep it.

Keep everything that already held: constraint table, states, page inventory, data honesty, the palette as it
is. Update the recommendations table to the corrected position and note it superseded A. Rerun the
document's checks (`pnpm build`, `pnpm test`, dry-run, `git diff --check`). Docs only, no code.

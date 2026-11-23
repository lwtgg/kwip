# Review: zlive as a 24/7 supplement provider (task 47)

Review branch `task/47-zlive` against `.prompts/47-zlive-supplement.md` and `DECISIONS.md` rules 20 and 22.
Do not edit files. Run the publisher yourself where a claim needs proving.

1. **Scope.** zlive sources appear only on 24/7 channels, never on event fixtures. No zlive source ever
   becomes the default when one of ours exists. Check the merge point, not just the tests.
2. **Inertness.** Prove it: stub the manifest to a timeout, a 500, a truncated body, a wrong schema and a
   278-channel manifest with all `live:false`. Each must produce byte-identical endpoint output to a build
   without the provider. One bounded GET, no retry storm, and the step cannot throw into the publish.
3. **Matching.** Read the normaliser: case, punctuation, quality suffixes (`FHD`, `HD`), region markers
   (`UK`, `USA`), and backup markers. A backup must never outrank a primary of the same channel, and a
   mismatched name must not win a slot. Name first, slug only as fallback. Say if any rule is too loose.
4. **Backups.** A `Backup` channel is an extra source labelled from their `tagline`, not a competing bid.
   Total per channel bounded.
5. **Quality banding.** `FHD` above `HD` above unlabelled, tiebreak only inside the band.
6. **Chips.** `4th` appears alongside `2nd`/`3rd` without special-casing one provider, and the ordinal is
   right when a fourth provider is genuinely present.
7. **Health.** `zlive.st` is in the registry with a conservative cap, probed on `/embed/<id>` for a 200
   carrying the player root. Three-state semantics unchanged, and a dead embed is not counted live.
8. **Weight.** Their embed pulls their SPA, a tracker and Google Fonts, and carries their branding. Confirm
   the frame is lazy and does not cost us CLS or an eager request on pages where zlive is not selected.
9. **Tests.** New tests assert behaviour, not implementation detail. Nothing in the five browser suites was
   weakened or given a longer deadline. Check any changed selector.
10. **Craft.** No dependency, tokens only, no `<video>` change, comments say why where a rule was chosen.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`,
with the command or surface that demonstrated each.

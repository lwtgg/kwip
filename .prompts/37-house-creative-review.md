# Review: house creative (task 37)

Review branch `task/37-house-creative` against `.prompts/37-house-creative.md`. Do not edit files. Verdict plus numbered defects.

Read `frontend-design`, `web-design-guidelines` and `kwip-conventions` first.

## Check

1. **Look at the actual crops**, not the source: render 970×90 and 320×100 from the committed HTML and view both. Nothing may be cut, cramped or born off-centre; the mobile crop may only show the centre 576 px.
2. **Legibility**: the small line reads at 970 wide and on a 320 phone; no glyph under the `Advertisement` chip; contrast measured, AA at minimum.
3. **It is a banner, not a card**: the composition uses the width on desktop, does not read as a second player or a second heading, and sits in the site's palette rather than a new one.
4. **Copy honesty**: no count, no exclamation mark, no "streaming", the second line makes sense landing on `/about#ads`.
5. **Same key**: filename `house.webp`, alt `kwip is ad-supported: how our ads work`, destination unchanged, so `/go` does not 410.
6. **Bytes**: 1940×180 WebP, ≤70 KB, metadata stripped, and in both buckets; proof from the remote object, not a local file.
7. The render note reproduces the file on this machine, and the slot's own slot sizes are untouched.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

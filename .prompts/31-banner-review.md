# Review: banner slots (task 31, `216204c`)

Review the committed diff against `.prompts/31-banner-slots.md` and `DECISIONS.md` rules 6 and 22. Do not edit files. Verdict plus numbered defects.

## Check

1. **No empty reservation.** With the flag off, or no creative, or an invalid creative, the page renders nothing where a slot would be — no dashed hole, no stray label. Test each of those.
2. **No shift.** The box is dimensioned before the image loads and keeps its size when the image fails, at both breakpoints. Confirm from the code and the measured CLS, not by assertion.
3. **Creative validation** is safe: same-origin image path, absolute http(s) destination without credentials, alt required. Try hostile values (protocol-relative, backslashes, control characters, `javascript:`, userinfo in the URL).
4. **Click accounting stays separate.** A banner click must neither consume nor be blocked by the click-under session cap, and `/go` must reject an unknown placement back to the homepage.
5. **SSR and cache.** The creative is in the server HTML, the existing cache rules are untouched, and a creative change does not require a client request. Note anything that could pair a stale image with a new destination and say whether it matters.
6. **Accessibility.** The label is real and associated, the image has the configured alt, the link is `rel="sponsored noopener noreferrer"`, and the creative is keyboard reachable with a visible focus ring.
7. **Tokens only**, no magic values, no dependency, and the label does not read as a second heading.

Reply exactly `VERDICT: pass|fail`, then numbered defects as `path:line — problem, and what it should do`.

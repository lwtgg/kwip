# Probe — can the top event autoplay muted?

Task 54 will put a playing player in the home page's first slot (rule 26). Before it is briefed, answer these
concretely against the two providers we actually have. Report only; do not change application code.

1. **taifood** (`https://taifood-blog.asia/embed/<uri>`): its player is JW-based. Which query parameters or
   fragment does the page honour (`?mute=1`, `?muted=1`, `?autoplay=1`, `#mute`, an `autoplay` attribute
   path)? Prove it in Chromium: load the embed with each candidate in an iframe, and read back whether the
   inner `<video>`/`<audio>` is muted and whether it is playing. `/fetch` is currently 500, so also state what
   can and cannot be proven while it is down.
2. **zlive** (`https://zlive.st/embed/<id>`): the same, and identify the player it uses and how its mute and
   autoplay are set. Report the exact URL form that yields muted autoplay, or that none does.
3. If neither honours a mute parameter, can we mute a cross-origin frame from outside at all? State the
   options (parameter only / postMessage API / a visible "Tap for sound" affordance where the frame starts
   audible) and which one the source supports.
4. **Chrome autoplay policy**: what happens with a cross-origin iframe whose inner player calls `play()` on
   load without a gesture — muted, refused, or dependent on the frame's own attributes? Cite what you observe,
   not the policy text alone.
5. Layout: what the first slot needs so nothing jumps — reserved box, its exact dimensions at 320/390/1280,
   and where a sound affordance goes given the card is still a link (rule 26). Note any conflict between
   "the card is a link" and "tap to unmute" and propose the split.
6. Cost: subrequests or bytes the home page adds per view by mounting a frame, and whether the top event
   should mount only when it is live and in viewport.

Write it to `docs/top-event-probe.md` with the commands you ran and the measured result of each. Keep it
under 120 lines. Branch `task/54-probe` off `main`; commit the doc. Gate: none needed beyond the doc.

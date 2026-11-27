# 60c — the state goes above the row; scores up; names up under the logos

The owner read production again after 60b. Row centring is now exact (0.00 px at every width), but he
says the row is *still* wrong, and this time he named the order:

> "The logos are centered to the 'Live' But thats not how I want it, as well as the score numbers.
> Those should be lower. Everything should be lower but the actual 'Live'. But I think its being
> caused by the min the game is at or quarter text. That line of text should be lower as well."

Plus: "the logos are still too far up from the team names", and "the score numbers are too little.
They need to be a bit bigger."

So the anchor is the **state line ("Live")**, not the score row. The state keeps its place; the logos,
the digits and the detail line all live below it. `60b`'s row-centre rule stays, but for the row that
carries logos and digits only.

## Measured from the owner's mockup (`/Users/julian/Downloads/Updated Instructions.png`)

Two cards on that sheet, both the same design, top one 1440 × 359 px, bottom 1150 × 182 px. As
fractions of the card they agree: state ink centre **28 % of card height above the card centre**;
score ink height **29–32 % of card height**; logo ink height 46 % (top) / 38 % (bottom); score ink is
**0.62–0.84 × the logo ink height**; the gap from logo ink bottom to name ink top is **0.20–0.21 × the
logo**; the detail ink band sits **level with the score ink**. State ink bottom → score ink top is
**0.8 × the state ink height**.

Production today, at 390 and 1280: the login/name gap is **33.8 px under a 40 px logo (0.84 ×)** and
**74.8 px under a 102 px hero logo (0.73 ×)**; listing score ink is 23 px on a 40 px logo (0.58 ×).
The gap is dead space under a centred logo in a row made tall by the score's line box, so this is a
layout cause, not a token.

## Build

Order, every scale and both column arrangements:

1. The state line is its own element above the score row, horizontally on the middle axis.
2. The score row carries the logos, the digits, and the detail line between the digits — the detail
   is level with the score ink, no longer a tier under the row.
3. The audience and the timeline stay under the row.
4. Logos sit at the bottom of the score row, not centred in it, so the label follows tightly.
5. Listing scores are ~0.8 × the logo ink height (2.75rem at the current 2.5rem logo, or derive it
   from the logo token). The hero score keeps its existing relationship to the hero logo.

The row centre still coincides with the card's centre (`60b`); the state sits in the space above it
with about one state line of clearance, and the top pad grows to hold it. Keep the lowest tier's
`--banner-pad-bottom` clearance at the bottom. Tokens only; no magic pixel values.

## Assertions (all widths 320/390/640/768/1024/1280/1440/1920/2560, both densities, both scales, root text)

- Existing row-centre (`<= 2 px`) and bottom-clearance assertions still pass, from layout and from 4x paint.
- State ink centre is 20–38 % of the card height **above** the card centre; state ink bottom to score
  ink top is 0.6–1.2 × the state ink height (paint, 4x).
- Detail ink band overlaps the score ink band vertically.
- Logo ink bottom → abbreviation ink top is `<= 0.3 ×` the logo ink height.
- Listing score ink height `>= 0.75 ×` the logo ink height; hero `>= 0.9 ×`.
- Order (state, row, detail, audience, track), fit, grapheme, wide-detail, no overflow and the
  existing pixel parity assertions all still pass. Replace the old `state_minus_score` centre check,
  which no longer describes the layout.
- Carry over the two open test findings from 60b's fix round: the WebKit 640 px hero DPR 2 parity
  residual of 0.41856 px against the 0.41 limit that the nudge snapping introduced, and the
  `state outside middle column` case where the state box measured 0 width at x 25.5
  (`chromium`, comfortable listing, normal).

## Also

Independent read-only question for the same round, no code: the owner says "a lot of the scores are
wrong". Compare live production cards (feed, SSR payload and rendered digits) and say where the wrong
number comes from — swapped sides, a stale value, a finished event still shown as live, or the fit
pass drawing a digit wrong. Report with examples and URLs; do not fix it here.

Doc: the order rule, mockup fractions, before/after gaps and score ratios. Gate as before. Commit, do
not deploy.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People arriving to find a live sports event and open a player, usually on a phone. They may arrive just after play starts, in a hurry, or on a weak connection. Some come back to find a replay.

## Product Purpose

kwip is a live sports event directory. In five seconds a visitor should be able to identify the right event, tell whether it is live or upcoming, and see where to go next. On an event page the next step is to open a working source or understand why one is unavailable.

## Positioning

kwip lists events and links to or frames third-party players. It hosts no media. The directory is ad-supported, carries few ads, and requires no account in v1.

The design reference is Apple Sports on iOS, translated into a website: recognizable events, prominent timing and availability, muted card colour, and detail at the event. kwip helps a visitor find where to watch; it is not a live-score service. Scores, team crests and personal favourites are not available from the current feed or v1 product.

## Operating Context

Visitors browse live, upcoming, and 24/7 listings, open a sport category, or browse the replay archive. An event can have embedded and external sources. A visitor can choose another source when one fails. The directory can show older listings with a freshness warning when appropriate.

## Capabilities and Constraints

- The canonical site is kwip.fyi. kwip.lol is a mirror.
- Listings must work when a poster is missing. The source picker retains a native select fallback without JavaScript.
- Player and banner space is reserved. The event banner follows the player.
- The web app offers dark and light themes, plus comfortable and compact density.
- The directory uses third-party media and imagery at their source. It adds no media proxy or native video player.
- There is no favourites store, native sheet or Live Activities integration in v1. Relevance comes from scheduled live events, then nearest upcoming events; 24/7 channels remain a separate group. This is the proposed ordering, not a claim of personalization.
- The feed supplies event names and schedule windows, not structured opponents, scores, lineups or play-by-play. Poster colours may inform decoration; they do not identify teams.
- The proposed web date strip selects dates represented in the available feed. It must not imply a complete calendar or historical results service. Today’s build has status filters only.
- Keep the Touchline palette and system typography. The direction and its constraints are documented in `docs/redesign-49a.md`; this is a design proposal, not implemented behavior.

## Product Principles

- Make the event, its state, and the next action easy to find on a phone.
- Keep source availability legible, including upcoming, stale, and unavailable states.
- Keep playback and advertising visibly distinct.
- Give time and availability a stable place across listings. Never substitute a countdown or viewer count for a score, or present scheduled live status as verified playback.
- Show useful listings immediately, without onboarding. Open an ordinary event URL for source choices and player help; retain browser Back and direct links.

## Accessibility & Inclusion

Preserve AA contrast, visible keyboard focus, 44 px targets, and reduced-motion support.

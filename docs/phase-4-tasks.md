# Phase 4 — Task tracker

Status: `[ ]` todo · `[~]` in progress · `[x]` done. One task ≈ one commit (or a small series) + its NOTES.md entry.
Size: S < 1h · M 1–3h · L 3h+. Built in the "Night signal" style from Phase 2a; Mapbox stays.

## The feature: connection arcs

When two people connect anywhere, a light arc draws between their dots across the globe. It stays faintly lit while they talk, and a small spark travels along it now and then. When the chat ends it fades away. Anyone on the map sees conversations happening around the world, not just dots sitting still.

- **Why this one:** Pulse is pitched as "a living globe". The arcs show the globe being used, and a reviewer sees them as soon as two windows connect. They reuse what's already there: the Mapbox restyle (P2-03), the dot states (P2-09) and the server-side pairing from Phase 3 (`Presence.peerId`).
- **Shortlisted, not built:** intent tags on dots, day/night line + their local time, shared heartbeat. These go in NOTES under "what I'd do next".
- **Optional "safe" half:** P4-07 / P4-08, only once the arcs ship.

### Decisions (settle before P4-01)

| Question | Recommendation | Why |
|---|---|---|
| Which pairs are public? | **Connected pairs only**: both `busy`, each one's `peerId` pointing at the other. Never pending requests. | A pending request shows who is calling whom before the callee has agreed. A connected pair only adds the line between two busy dots, and both are already shown as busy today. |
| What does the server send? | Pairs as `[idA, idB]`, no coordinates. | The client already has every peer's fuzzed position, and its own position (`me`) for its own chat. There's nothing new to leak. |
| Arc color | **Green `live`**, low opacity; your own arc a bit brighter. | Color rule from P2-01: green = live/connected status, never tappable. An arc is a status, so amber would break the rule. |
| Arcs already there when you enter | Shown without the connect burst. | Otherwise entering the map fires a burst for every chat already running. |
| Reduced motion | Arcs appear and disappear with a fade, no draw-in, no traveling spark. | Same approach as the spin and fly-in in P2-07. |

## Overview

| ID | Task | Size | Depends on | Status |
|----|------|------|-----------|--------|
| P4-01 | Poll returns connected pairs | S | — | [x] |
| P4-02 | Great-circle arc geometry | S | — | [x] |
| P4-03 | Arc layers on the map: draw in, hold, fade out | L | 01, 02 | [x] |
| P4-04 | The connect moment: burst at both ends | M | 03 | [x] |
| P4-04b | Arcs rise in 3D when the map is tilted | L | 03 | [x] |
| P4-05 | Header: "N online · M chatting" | S | 01 | [x] |
| P4-06 | Multi-window test + NOTES Phase 4 section | M | 01–05 | [x] |
| P4-07 | *Optional:* consent-first video (blurred until you reveal) | S | — | [ ] |
| P4-08 | *Optional:* Leave & block | M | — | [ ] |

---

### P4-01 · Poll returns connected pairs
- **Files:** `lib/types.ts`, `app/api/poll/route.ts`
- **Do:** add `pairs: [string, string][]` to `PollResponse`. In poll, also select `peerId` for the online rows (include the caller's own row, which the peers query skips today). Build pairs where both rows are `busy` and their `peerId`s point at each other. Emit each pair once (smaller id first). Don't add `peerId` to `PeerDot`: only the pairs leave the server.
- **Check:** `accept` sets the acceptor to `busy + peerId` and the requester to `busy` (its `peerId` is already set from `request`), so a pair counts only once the chat is accepted. `end` / `leave` clear both, so the pair drops on the next poll.
- **Done when:** two windows that connect show their pair in the poll response within one poll (1.5 s). A pending request never shows up as a pair.
- **Done:** poll reads every online row once (caller included), keeps `peers` as before (caller filtered out, explicit fields so `peerId` isn't sent), and builds `pairs` with a `Map` lookup, emitting each pair from its smaller id. Verified with three scripted sessions (A, B, C): idle `[]` → A requests B `[]` → B accepts `[[A,B]]` for both C and A → A ends `[]` → C + A pair `[[C,A]]` (smaller id first) → A leaves `[]`; no `peerId` in the response. The client ignores `pairs` until P4-03.

### P4-02 · Great-circle arc geometry
- **Files:** new `lib/arcs.ts`
- **Do:** `arcCoordinates(a, b, steps = 64)` returns points along the great circle (slerp on unit vectors). Mapbox draws a long two-point line straight in Mercator, which looks wrong on the globe. Unwrap longitudes so an arc across the antimeridian stays one continuous line. Keep it dependency-free (no turf).
- **Done when:** Tokyo → San Francisco curves over the Pacific (not across Asia/Europe), and two dots 3 km apart give a short, clean line.
- **Done:** `arcCoordinates(a, b, steps = 64)` → `steps + 1` `[lng, lat]` points (fixed count so draw-in time doesn't depend on distance). Same-point / antipodal inputs fall back to a straight line. Checked with a Node script: Tokyo → SF midpoint 48.64° N, 172.26° W (North Pacific), end lng 237.58 (unwrapped); Manila → London midpoint 51.0° N, 81.5° E; Fiji → Samoa largest lng step 0.16°; route length = great-circle distance and every segment equal, for all cases.
- **Tried and removed after P4-04:** a sideways `bow()` (20% of the length, toward the north) to make short arcs curve from above. It was a misread of the feedback: the wish was an arc that stands up when tilted (P4-04b), and the bow tipped that arch north. Arcs are plain great circles again.

### P4-03 · Arc layers on the map
- **Files:** `app/components/WorldMap.tsx`, `lib/map-theme.ts` (colors), `app/page.tsx` (pass `pairs`)
- **Do:**
  - `WorldMap` takes `pairs`. On `style.load`, add one GeoJSON source and two line layers below the markers: a wide, blurred glow and a thin core, both `live` green, `line-emissive-strength` so the night style doesn't dim them.
  - Reconcile like the markers: new pair → draw in over about 1.2 s (grow the coordinate slice), present → hold, gone → fade out, then drop. Resolve each end from `peers`, or from `me` for your own pair. Skip a pair whose dot isn't known yet; the next poll adds it.
  - A small spark (circle layer) travels along each held arc every few seconds, with a random phase per arc, like the dot twinkle.
  - One `requestAnimationFrame` loop updates the source with `setData`, and runs only while something is animating. It pauses when the tab is hidden and under reduced motion.
  - Your own arc gets a feature property → brighter.
- **Watch for:** `paint` properties like `line-trim-offset` apply to the whole layer, not per arc, so the draw-in grows each feature's coordinates instead. Cap the number of drawn arcs (e.g. 100) so a busy map stays smooth.
- **Done when:** connecting two windows draws the arc in, it holds while they chat, ending fades it out, and panning, zooming and the globe view all look right.
- **Done:** `lib/arc-layer.ts` (`createArcLayer(map)` → `setArcs(arcs, { seed })` / `destroy()`): sources `pulse-arcs` + `pulse-arc-sparks`, layers `pulse-arc-glow` / `pulse-arc-core` (line, blurred + thin) and `pulse-arc-spark-glow` / `pulse-arc-spark` (circle), inserted before the first symbol layer. Opacity and width are data-driven from feature properties `alpha` and `mine`. Draw-in 1.2 s (ease-out, interpolated tip), fade 0.6 s, spark trip 2.4 s + 2–6 s random pause, cap 100. `page.tsx` keeps `pairs` (null until the first poll) and passes `pairs` + `selfId`; `WorldMap` creates the layer once `ready` and resolves each pair's ends from `peers` / `me`. `destroy()` only cancels the frame, since the map (and its layers) may already be removed on unmount. `line-emissive-strength` not used: it only matters with 3D lights (Standard style), and dark-v11 has none.
- **Verified** with scripted sessions in the browser pane (Manila pair, Tokyo ↔ SF on the globe, a stranger I accepted for my own arc, end / leave clearing). Draw-in seen part-drawn in one frame; exact timing not measurable with the screenshot tool. Not checked yet: phone width, reduced motion → P4-06.

### P4-04 · The connect moment
- **Files:** `app/components/WorldMap.tsx`, `app/globals.css`
- **Do:** when a pair first appears (not on the first poll after entering), each end gets a one-shot green ripple: a `data-burst` attribute on the marker element, styled on the inner core (Mapbox owns the outer element's inline styles; same lesson as P2-09), removed after the animation. Use `.pulse-me-core` when the end is you. Skipped under reduced motion.
- **Done when:** a connection anywhere on screen is noticeable at a glance, without being loud.
- **Done:** a `<span class="pulse-burst">` child instead of a `data-burst` attribute, so it can't clash with the core's `::before` (target orbit) / `::after` (heartbeat). `setArcs` now returns the keys that start drawing in (empty for seeded arcs and under reduced motion); `WorldMap` ripples the start dot at once and the far dot after `DRAW_MS`, removing each after `BURST_MS` (1.1 s). Own arc reordered to start at "You" (key unchanged). Ring: 12 px, `--color-live`, scale 0.6 → 4.5 over 0.9 s, plus a `::after` echo 0.2 s later. Verified with a MutationObserver: 0 ms / +1206 ms, removed after 1100 ms, own arc on `pulse-me` first, seeded → no ripple; frozen frame checked visually. Dev-only gotcha: a hot reload of `lib/arc-layer.ts` kept the old layer object (`drawing is not iterable`); a page reload fixes it, production is unaffected.

### P4-04b · Arcs rise in 3D (added from testing)
- **Why:** tilted (Ctrl + drag), the arcs were still painted flat on the ground.
- **Tried first, dropped:** `line-z-offset` + `line-elevation-reference: "sea"` with a `["line-progress"]` sine expression. Mapbox's `drawLineTiles` returns early for elevated lines on the globe projection, and with `setProjection("mercator")` the raised arc was clipped per tile (a constant 500 m offset showed only one half, which half depending on the camera). No style setting fixed it (width, opacity, caps/joins, layer order all checked).
- **Done:** `lib/arc-3d.ts`, a custom layer (`renderingMode: "3d"`) drawing ribbons from the same animation state: per vertex = segment ends (Mercator, relative to an origin), end flag, side, alpha, mine; the vertex shader extrudes in screen pixels; passes = glow (soft falloff) + core (AA rim), sparks = streak with a tail→head alpha ramp. Height `min(0.25 × distance, 300 km) × sin(π × progress)`, progress carried per point so a part-drawn arc keeps its final shape. Drawn only at zoom ≥ 6 (`customLayerMatrix()` is the Mercator matrix; the globe is flat from 6), cross-fading with the flat layers over 6–7 (`interpolate` on `zoom` in their opacity; see P4-06 for why a whole zoom level). Depth test and culling off. `arc-layer.ts` now builds `Line3D` lists once per frame and feeds both renderers; `lib/arcs.ts` gained `distanceMeters`.
- **Follow-up (user: "it should not be tilted"):** from straight above the raised arch leaned away from the screen centre (perspective), and the bow tipped it north. Bow removed; the vertex shader scales height by `u_lift = smoothstep(pitch / 50°)` (`map.getPitch()` per frame, vertices unchanged), so the top view is a straight line and the arch rises upright as you tilt. Checked at pitch 0 / 25 / 60 / 72 (bearing −25).
- **Verified:** pitch 62° arch from "You" over the city, top-down lands on both dots, zoom 9.5 meets the stranger's dot, globe zoom 3 clean, spark streak seen, no console errors/warnings. **Not checked:** phones / low-end GPUs (P2-20), reduced motion with 3D (no draw-in/sparks by the same rule, not looked at).

### P4-05 · Header: "N online · M chatting"
- **Files:** `app/components/Header.tsx`, `app/page.tsx`
- **Do:** the status pill adds the number of live chats from `pairs.length` (e.g. "5 strangers online · 2 chats"). It stays "Just you right now" when you're alone.
- **Done when:** the count matches the arcs on the map and updates with each poll.
- **Done:** `Header` takes `chats` (`pairs?.length ?? 0` from `page.tsx`) and appends a muted "· N chat(s)" (the `·` is `aria-hidden`) only when `chats > 0`. Verified by sampling the header every 0.5 s through join / connect / end / leave (always equal to the arc count) and at 375 px (one line).
- **Also fixed (arc-layer.ts):** the frame where a draw-in or fade-in finishes isn't "animating", so it was never pushed and the arc kept its 99% frame (64 of 65 points). `wasAnimating` now forces one more push after animation stops. Seen while testing: with the browser pane hidden, `requestAnimationFrame` pauses, so arcs freeze until the page is visible again (expected browser behaviour, catches up on return).

### P4-06 · Test + NOTES
- **Test:** two windows show your own arc. To see a pair you're *not* part of, use four windows (two browsers × normal + private), mock locations far apart (e.g. Manila, Tokyo, San Francisco, London). Cases: connect → draw-in + burst; end → fade; close one tab mid-chat → `leave` clears it; reload while others are chatting → arcs present, no burst; reduced motion; phone width.
- **NOTES.md Phase 4:** what it is and why (alive), the privacy reasoning (connected pairs only, ids only, fuzzed ends), the trade-offs, and what I'd do next (the shortlisted ideas).
- **Done when:** every case above has been checked on the Vercel deploy, and NOTES has the section.
- **Done (locally):** scripted strangers (Node, through the real API) + in-page probes. Connect → draw-in + ripples (P4-04 timings); end → 0.6 s fade then removed; tab close (`/api/leave`) → arc gone; reload while chats run → arcs present, no ripples; reduced motion (`matchMedia` stubbed before the map loads) → arc whole on first frame, alpha 0 → 1.00 in 0.64 s, 0 sparks, 0 ripples, fade-out 0.6 s; 375 × 812 → header one line, arc + tilted arch render, ripples on `pulse-me` and the dot; Tokyo ↔ SF → great circle on the globe, single raised line from zoom 7. NOTES has "How the whole feature was tested", the known phone gap and "What I'd do next".
- **Fixed during testing:** tilted at zoom 6.8 a long arc showed twice (raised + dim flat). Mapbox evaluates zoom-and-data ("composite") expressions at integer zooms, so the flat layers' 6 → 6.5 fade ran 6 → 7. `FADE_ZOOMS` is now 1 and the lift is multiplied by `fade³`, so the raised arc lies on the flat one until it's nearly gone. Checked at 6.5 (one line) and 7.3 (one raised line).
- **Moved to P2-20:** the run on the Vercel URL with two real devices (WebRTC), real phones / GPUs. **Known gap → Phase 2 follow-up:** on phones your own arc is under the chat sheet.

---

## Optional — the "safe" half

### P4-07 · Consent-first video
- **Files:** `app/components/VideoPanel.tsx`
- **Do:** the other person's video starts blurred with a "Reveal" button; you decide when to see them. Blur is on *your* side (CSS), so it protects you from what's sent to you. Audio plays normally. Resets each call.
- **Done when:** every new call starts blurred, and Reveal works by keyboard and screen reader.

### P4-08 · Leave & block
- **Files:** `app/api/signal/route.ts`, `prisma/schema.prisma`, `app/components/ChatPanel.tsx`
- **Do:** "Leave & block" ends the chat, and the server then auto-declines requests from that session to you, for as long as either session lives. Blocks are deleted with the session, so nothing outlives it.
- **Done when:** a blocked session can't reach you again, and the block disappears when either side leaves.

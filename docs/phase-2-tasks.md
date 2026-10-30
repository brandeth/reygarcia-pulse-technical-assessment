# Phase 2 — Task tracker

Status: `[ ]` todo · `[~]` in progress · `[x]` done. One task ≈ one commit (or a small series) + its NOTES.md entry.
Size: S < 1h · M 1–3h · L 3h+. Mapbox stays; all map styling happens at runtime on `dark-v11`.

## Overview

| ID | Task | Phase | Size | Depends on | Status |
|----|------|-------|------|-----------|--------|
| P2-01 | Pick visual direction | 2a | S | — | [x] |
| P2-02 | Design tokens + base styles | 2a | S | 01 | [x] |
| P2-02b | Shared `Button` component | 2a | S | 02 | [x] |
| P2-03 | Restyle the Mapbox map | 2a | M | 02 | [x] |
| P2-04 | Header: wordmark + online count | 2a | S | 02 | [x] |
| P2-05 | Toast queue (fixes Task 8) | 2a | M | 02 | [x] |
| P2-06 | Status pill + session-expired banner | 2a | S | 05 | [x] |
| P2-07 | Keep map mounted behind the gate | 2a | M | 03 | [x] |
| P2-08 | Entry screen redesign | 2a | M | 07 | [x] |
| P2-09 | Dot redesign | 2a | M | 03 | [x] |
| P2-10 | "Me" marker redesign | 2a | S | 09 | [x] |
| P2-11 | Outgoing request: countdown + target ring | 2a | M | 06, 09 | [x] |
| P2-12 | Incoming request card | 2a | M | 02, 09 | [x] |
| P2-13 | Chat panel layout | 2a | L | 02 | [x] |
| P2-14 | Chat "ended" state | 2a | M | 13 | [x] |
| P2-15 | Video panel redesign | 2a | L | 13 | [x] |
| — | *Phase 4 feature, built in the new style* | P4 | — | 2a done | — |
| P2-16 | Motion pass + reduced motion | 2b | M | 2a done | [ ] |
| P2-17 | Accessibility pass | 2b | M | 2a done | [ ] |
| P2-18 | Empty states + copy pass | 2b | S | 2a done | [ ] |
| P2-19 | Branding: favicon, metadata, OG image | 2b | S | 01 | [ ] |
| P2-20 | Real-device QA | 2b | M | 16–18 | [ ] |
| P2-21 | NOTES.md Phase 2 section | 2b | S | all | [ ] |
| P2-22 | *Optional:* light/dark theme toggle | 2b | L | everything else | [ ] |

---

## Phase 2a — Foundation

### P2-01 · Pick visual direction
- **Goal:** lock mood, palette, typography. Leading option: "Night signal" (ink-navy globe, glowing dots, one warm accent instead of emerald).
- **Output:** optional static comparison page (2–3 directions: entry + map with chat open).
- **Done when:** accent, neutrals, danger color, display font and body font are decided and written down here.
- **Decided — "Night signal":**

  | Token | Value | Use |
  |---|---|---|
  | `ink` | `#070b14` | page background, map water |
  | `surface` / `glass` | `#0e1422` / same at 72% + blur | panels, cards, toasts |
  | `line` | white at 8% | hairline borders |
  | `fg` / `muted` | `#e8ecf4` / `#8a93a6` | body / secondary text |
  | `accent` | `#ffb547` warm amber | dots, primary actions, own bubbles |
  | `danger` | `#f0475b` rose red | end chat/call, errors |
  | `live` | `#4ade80` mint green | status only: "live / connected right now" (header dot, chat "Connected", call status) |
  | Display font | Space Grotesk | wordmark, headings |
  | Body font | Geist | everything else |

  Amber over coral so "connect" and "end" never look alike.

  **Color rule:** amber = something you can act on + brand (dots, primary buttons, own bubbles); green = live/connected status, never tappable; rose = ending or error. Each color keeps one meaning.

### P2-02 · Design tokens + base styles
- **Files:** `app/globals.css`, `app/layout.tsx`
- **Do:** colors / surfaces (glass) / radii / shadows / motion durations in `@theme`; remove `body { font-family: Arial }` (it overrides Geist); add the display font via `next/font`; drop unused light/dark `:root` vars; safe-area inset variables.
- **Done when:** components can use token classes, and the app renders in the chosen fonts.
- **Note:** nothing uses `vh` (the app is `fixed inset-0`), so no `dvh` change was needed. `viewportFit: "cover"` is deliberately *not* on yet: it lets content run under the notch, so it gets turned on in the first task that actually pads with the `--safe-*` insets (P2-04 / P2-13).

### P2-02b · Shared `Button` component
- **Files:** new `app/components/Button.tsx`
- **Do:** one button with variants `primary` (amber: Enter, Accept, Send), `secondary` (glass/outline: Decline, Cancel), `danger` (rose: End, End video), and sizes sm / md / lg / `icon` (round: video/mic/camera toggles). Icon is a size, not a variant, so an icon button can still be danger (end call). Shared hover, press, disabled and focus styles; passes through native `<button>` props; defaults to `type="button"`; TypeScript requires `aria-label` on icon buttons.
- **Why:** five components each hardcode their own button classes today; restyling them separately would drift. Screen tasks (06, 08, 11–15) swap in `<Button variant=…>` instead.
- **Done when:** the component exists and is used by the first screen task that needs it (no screen is migrated in this task itself).

### P2-03 · Restyle the Mapbox map
- **Files:** `app/components/WorldMap.tsx`
- **Do:** after `load`, `setPaintProperty` on water / land / borders / labels to match the palette; `setFog` for horizon glow + starfield. Optional: compare Mapbox Standard (night preset) and switch only if clearly better.
- **Done when:** the map reads as part of the design, not stock `dark-v11`.
- **Done:** `lib/map-theme.ts` recolors the layers by role (background / fill / line / symbol, matched on layer id) and sets a night-sky fog (navy rim, light starfield); wired via `map.on("style.load")`. dark-v11 already ships `projection: globe`, so no projection change. Mapbox Standard not adopted: the restyled dark-v11 already fits, and Standard is heavier.

### P2-04 · Header: wordmark + online count
- **Files:** `app/page.tsx`, `app/components/WorldMap.tsx` (move the counter out), new `app/components/Header.tsx`
- **Do:** wordmark + live "N online" with a small heartbeat indicator; replaces the bottom-left pill.
- **Done when:** the header is visible on the map screen at desktop and mobile widths and doesn't block map gestures.
- **Done:** `Header.tsx` (Space Grotesk wordmark + glass count pill whose dot is green `live` + `animate-heartbeat` when others are online, and a still gray `muted` dot when you're alone; green, not amber, because it's a status). Copy fixed: the poll excludes self, so "0 online" now reads "Just you right now" / "1 stranger online". The old pill also overlapped the Mapbox logo. Pads with `--safe-*`, but `viewportFit: "cover"` stays off until P2-13 pads the chat input (turning it on now would put the input under the iPhone home bar).

### P2-05 · Toast queue (fixes Task 8)
- **Files:** `app/page.tsx`, new `app/components/Toasts.tsx` (hook + view)
- **Do:** `useToasts` with a per-toast id and timer (fixes the overlapping timers in `showNotice`); info / error variants; max 2–3 stacked; `aria-live="polite"`; enter/exit animation.
- **Done when:** two notices in quick succession each get their full duration, and the earlier timer no longer clears the newer one.
- **Done:** `app/components/Toasts.tsx` (`useToasts` + `Toaster`). Per-toast timers, info / error variants (error = rose dot + border), max 3, `role="status"` live region, drop-in / fade-out animation tokens. "Session expired" is a sticky error toast until P2-06 makes it a banner. Measured: toast A 6 → 3713 ms, toast B (fired at 3 s) 3018 → 6744 ms, i.e. B keeps its full 3.5 s.

### P2-06 · Status pill + session-expired banner
- **Files:** `app/page.tsx`
- **Do:** one persistent status slot for "Requesting…" and "Waiting for video…", kept clear of the toast stack (toasts now sit at `top-[4.5rem]`; the requesting pill still sits at `top-20` and can overlap them); "Session expired" becomes a banner with a Reload button, replacing the sticky toast.
- **Done when:** status and toasts never overlap, and the expired state has a way out.
- **Done:** `StatusPill.tsx` (spinner + text + optional `Button` Cancel) renders as children of `Toaster`, so status and toasts share one column under the header and stack. The column re-centers over the visible map when the chat drawer is open (`md:right-[28rem]`). Video requests can now be cancelled (sends `video-end`, which closes the other side's prompt). "Session expired" is a blocking `SessionExpired.tsx` card (alertdialog, Reload button auto-focused) instead of a banner, because nothing works past that point; the sticky-toast option was removed. Trade-off: if it fires mid-chat, the card covers a peer-to-peer chat that still works. Rare (secret rotation only).

## Phase 2a — Screens

### P2-07 · Keep map mounted behind the gate
- **Files:** `app/page.tsx`, `app/components/WorldMap.tsx`, `app/components/EntryGate.tsx`
- **Do:** render `WorldMap` from the start (world view, slow rotation) with the gate as an overlay; on enter, `flyTo` the user's location instead of re-initializing the map.
- **Done when:** gate → live is one continuous camera move with no map reload, and polling/presence still start only after join.
- **Done:** map mounts on first render at world view; idle spin via chained `easeTo` (~120 s per turn, skipped under reduced motion because Mapbox makes non-essential eases instant, which would loop); `flyTo` zoom 4 over 2.8 s on the first `me` fix (not `essential`, so reduced motion jumps). `myLocation` is now set only after a successful join, so a failed join leaves no pin and no camera move. Gate is an `absolute` overlay with an `ink/55` scrim.
- **Handed to P2-08:** country labels are busy behind the gate text (stronger center scrim, or hide labels while gated); the button still says "Locating…" during the join request (dev DB took 2.7 s cold), so it should become "Joining…"; fade the gate out instead of unmounting it instantly.

### P2-08 · Entry screen redesign
- **Files:** `app/components/EntryGate.tsx`
- **Do:** wordmark + tagline over the globe; three trust points (no account · fuzzed 1–3 km · nothing stored); designed locating / error states, including how to re-enable denied location.
- **Done when:** all states (idle, locating, denied, unsupported, server error) look intentional.
- **Done:** map labels hidden behind the gate (`hideLabels` / `showLabels` in `lib/map-theme.ts`, each layer's own `text-opacity` restored, fading in during the second half of the fly-in); radial scrim; Space Grotesk hero; amber `Button size="lg"` with spinner; states idle / "Finding you…" / "Joining…" / error, with an error card per cause (denied → how to re-enable, unavailable, unsupported, server) and "Try again"; three icon trust points (row on desktop, centered stack on phone); gate fades out over 0.4 s (`animate-gate-out`, opacity only) while the camera flies. Unsupported-browser state not exercised live.

### P2-09 · Dot redesign
- **Files:** `app/globals.css`, `app/components/WorldMap.tsx`
- **Do:** replace random `dotColor()` hues with state styling (available = accent glow, busy = hollow and dimmed + not-allowed cursor); heartbeat (double-beat) pulse; scale-in on join, fade-out on leave; `aria-label` instead of `title` only.
- **Done when:** the state of every dot is readable at a glance, and dots don't pop in or out.
- **Done:** amber dot with glow + GPU heartbeat ring (`::after`, transform/opacity) with a random `--dot-delay` per dot; busy = hollow muted ring, no pulse, `not-allowed`, `aria-disabled`; `dot-in` / `dot-out` (300 ms, then `marker.remove()`); `aria-label` per state; 28 px tap target. All state is `data-busy` / `data-leaving` on the marker element, styled on the inner core.
- **Bug fixed (user report):** busy dots flashed back to "available" on pan/zoom for ~1 s. Mapbox's `Marker._evaluateOpacity()` rewrites the marker element's inline `opacity` on every camera move (to fade dots behind the globe), overwriting our `style.opacity = 0.35` until the next poll.
- **Taps now explain themselves:** busy dot → "They're in another chat right now." (no request sent); while requesting → "You're already waiting for an answer."; while chatting → "Finish your current chat first." `canConnect` prop removed; `onPeerClick(id, busy)`.
- **Changed for P2-13:** dots no longer have per-user colors, so "avatar in their dot color" no longer applies.

### P2-10 · "Me" marker redesign
- **Files:** `app/components/WorldMap.tsx`, `app/globals.css`
- **Do:** replace the 📍 emoji with a designed marker (distinct from peers, consistent across OSes).
- **Done when:** it looks the same on Windows / macOS / iOS / Android.
- **Done:** `.pulse-me` (outer, Mapbox-owned) + `.pulse-me-core`: white `fg` core, ink gap, thin white ring, soft halo; glass "You" label; no heartbeat; `z-index: 1` over peer dots; centered anchor (was the pin's tip); `role="img"` + `aria-label="Your location"` set before the Marker is created. Also fixed: Mapbox adds `role="img"` to marker elements without a role, which made peer dot `<button>`s read as images; they now set `role="button"`. Landing zoom raised from 4 to 11 (flight 2.8 → 3.5 s, label fade delay 1.2 → 1.8 s): at zoom 4 a stranger a few km away hid under "You" (user's report).
- **Possible follow-up (not scheduled):** adaptive landing that frames you + the nearest few strangers, and a `maxZoom` cap (~12) so fuzzed dots never look like street addresses.

### P2-11 · Outgoing request: countdown + target ring
- **Files:** `app/page.tsx`, `app/components/WorldMap.tsx`
- **Do:** countdown ring tied to `REQUEST_TIMEOUT_MS` in the status pill; animated ring on the target dot; Cancel stays one tap away.
- **Done when:** the user can see who they're calling and how long is left.
- **Done:** `StatusPill` takes `countdownMs` → SVG ring (`pathLength=100`, `animate-countdown`, duration inline), keyed by `peerId` so each request gets a full ring; `WorldMap` takes `targetId` → `data-target` → scaled core + dashed amber orbit (`::before`, `dot-orbit`). Measured: ring progress = elapsed / 30 s; pill + target clear together at 30.1 s with "No answer."; also clear on Cancel, decline and accept.

### P2-12 · Incoming request card
- **Files:** `app/components/ConnectionPrompt.tsx`, `app/page.tsx`
- **Do:** a card that doesn't block the map (no black overlay); fly to / highlight the requester's dot; flash the tab title when the tab is hidden; reuse it for the incoming-video prompt.
- **Done when:** a request is noticeable even in a background tab, and the map stays visible.
- **Done:** `ConnectionPrompt` is a bottom glass card (`kind` connect / video, `animate-card-in`, Button primary + secondary, `role="alertdialog"`, no dark overlay); connect shows the caller's amber dot inside a `CountdownRing` (extracted from StatusPill) for `REQUEST_TIMEOUT_MS`; video card has a camera icon, no countdown, `md:right-[28rem]`. `targetId` now covers incoming too, and `WorldMap` flies to an off-screen target once per request (skipped while the camera is moving, e.g. mid entry flight). `page.tsx` flashes `document.title` every 1 s while a request is pending and the tab is hidden, restoring it on answer/unmount.

### P2-13 · Chat panel layout
- **Files:** `app/components/ChatPanel.tsx`
- **Do:** turn on `viewportFit: "cover"` in `layout.tsx` and pad with `--safe-bottom` (also check VideoPanel's bottom bar and any other bottom-anchored UI); floating glass panel on desktop, bottom sheet on mobile; stranger avatar in their dot color; grouped bubbles; inline system lines ("Connected · peer-to-peer"); "Connected" status uses the green `live` token; Video / End as icon buttons.
- **Done when:** the map stays partly visible on desktop, and on mobile the input isn't covered by the on-screen keyboard.
- **Done:** `ChatPanel` is a `<section>`: bottom sheet (`h-[72dvh]`, `rounded-t-panel`) on phones, floating glass panel (`md:w-96`, 1rem gaps, below the header) from `md`. Header: amber avatar, green `live` "Connected", `Button size="icon"` video, danger "End". `role="log"` message list with grouped bubbles (flattened inner corners, `mt-0.5` within a group), a lock line about peer-to-peer, `[overflow-wrap:anywhere]` for long words. Input `text-base` on phones (no iOS zoom), `enterKeyHint="send"`, icon Send. `viewportFit: "cover"` + `interactiveWidget: "resizes-content"` on; Mapbox bottom controls and the video bar padded with `--safe-*`. Toast column / video card offsets 28rem → 25rem.
- **Not verified:** real keyboards (iOS/Android) → P2-20. Avatar is uniform amber (dots no longer have per-user colors, P2-09).
- **Follow-up idea:** on phones the "You" marker sits behind the sheet; pad the map camera by the sheet's height while chatting so it stays in the visible strip.

### P2-14 · Chat "ended" state
- **Files:** `app/page.tsx` (new `Conn` kind), `app/components/ChatPanel.tsx`
- **Do:** when the stranger leaves or the connection fails, keep the messages in memory and show "Chat ended · Back to map" instead of the instant wipe in `teardown()`.
- **Done when:** a disconnect never yanks the conversation away mid-read, and nothing is persisted.
- **Done:** `Conn` gains `{ kind: "ended"; peerId; reason }`. `teardown()` split into `closePeer()` (network/media) + state reset; new `endChat(reason)` for partner `end` signal, channel close ("The stranger left the chat.") and ICE failure ("The connection dropped.", replaces the old error toast); own End still tears down. While ended you're free: a new `request` replaces it, tapping a free dot dismisses it and requests, a duplicate `end` is ignored. `ChatPanel` gets `endedReason` + `onClose`: gray "Chat ended", video/End hidden, divider line with the reason, "Nothing was stored…" line, input replaced by an auto-focused "Back to map".
- **Seen in testing:** closing a tab inside the browser pane doesn't fire `pagehide`, so the partner learned via WebRTC failure (~12 s, "The connection dropped."); a real tab close sends `leave` → "The stranger left the chat."

### P2-15 · Video panel redesign
- **Files:** `app/components/VideoPanel.tsx`, `app/page.tsx`, possibly `lib/webrtc.ts` (track toggles)
- **Do:** mic / camera toggles (`track.enabled`); mirrored local preview; draggable picture-in-picture; chat reachable during the call; move the "waiting for video" pill off the chat input.
- **Done when:** a full call (request → accept → toggle mic/cam → end → back to chat) works on desktop and mobile.
- **Done:** `VideoPanel` rewritten: `md:right-[25rem]` so the chat panel stays usable beside the call; phones full screen + "Chat" button → minimized 96×144 remote tile (state inside VideoPanel, resets when the call ends). Mic / camera toggles flip `track.enabled` (no renegotiation), red `danger` + `aria-pressed` when off, "Camera off" placeholder. Local preview mirrored (`-scale-x-100`), draggable with pointer capture, snaps to the nearest corner with a FLIP transform glide (skipped under reduced motion). Glass control bar, `End video` danger. Tested with a canvas-generated stream standing in for the camera.
- **Not done:** the other side isn't told when you mute / turn the camera off (they see black / hear silence); a cancel-vs-accept race on video requests (noted in P2-06) is still open; real-device camera/mic → P2-20.

## Phase 2b — Polish (after Phase 4)

### P2-16 · Motion pass + reduced motion
- Panel/sheet transitions, button press states, camera easing; `prefers-reduced-motion` disables the looping pulse and big camera moves.

### P2-17 · Accessibility pass
- Focus rings, keyboard access for prompts / chat / video controls, contrast check on the tokens, labels on icon buttons.

### P2-18 · Empty states + copy pass
- "No one online yet" with the globe still alive; one consistent voice for every notice, button and error.

### P2-19 · Branding
- **Files:** `app/favicon.ico`, `app/layout.tsx` metadata, OG image.

### P2-20 · Real-device QA
- iOS Safari (camera, `playsInline`, keyboard), Android Chrome, narrow widths, two-user run on the Vercel URL.

### P2-22 · *Optional:* light/dark theme toggle (deferred)
- **When:** only after every other Phase 2 and Phase 4 task is done. Skipping it is a valid outcome.
- **Files:** `app/globals.css`, `app/layout.tsx`, `lib/map-theme.ts`, new `app/components/ThemeToggle.tsx`, plus a light pass over every screen.
- **Do:**
  - Tokens point at CSS variables that switch under `[data-theme="light"]`.
  - A light palette in `lib/map-theme.ts`, re-applied when the theme changes.
  - A light design for the dots (a glow has no contrast on a light map).
  - Follow `prefers-color-scheme` by default; a sun/moon `Button size="icon"` overrides it.
  - Apply the saved choice before hydration (inline script or `next-themes`) so the page never flashes the wrong theme.
- **Trade-offs to note in NOTES:** the saved choice lives in `localStorage` (a UI preference, not user data, but worth saying given "nothing stored"); every screen has to be checked in both modes.
- **If skipped:** NOTES says dark-only is deliberate, because the product is a night-sky globe of glowing dots.
- **Done when:** every screen and the map look intentional in both modes, the toggle works with keyboard and screen readers, and there's no flash on reload.

### P2-21 · NOTES.md Phase 2 section
- Direction and why · kept Mapbox and restyled it at runtime · UX fixes (toast queue, ended state, request countdown) · what's next. Before/after screenshots if there's room.

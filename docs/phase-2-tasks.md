# Phase 2 — Task tracker

Status: `[ ]` todo · `[~]` in progress · `[x]` done. One task ≈ one commit (or a small series) + its NOTES.md entry.
Size: S < 1h · M 1–3h · L 3h+. Mapbox stays; all map styling happens at runtime on `dark-v11`.

## Overview

| ID | Task | Phase | Size | Depends on | Status |
|----|------|-------|------|-----------|--------|
| P2-01 | Pick visual direction | 2a | S | — | [x] |
| P2-02 | Design tokens + base styles | 2a | S | 01 | [x] |
| P2-02b | Shared `Button` component | 2a | S | 02 | [ ] |
| P2-03 | Restyle the Mapbox map | 2a | M | 02 | [ ] |
| P2-04 | Header: wordmark + online count | 2a | S | 02 | [ ] |
| P2-05 | Toast queue (fixes Task 8) | 2a | M | 02 | [ ] |
| P2-06 | Status pill + session-expired banner | 2a | S | 05 | [ ] |
| P2-07 | Keep map mounted behind the gate | 2a | M | 03 | [ ] |
| P2-08 | Entry screen redesign | 2a | M | 07 | [ ] |
| P2-09 | Dot redesign | 2a | M | 03 | [ ] |
| P2-10 | "Me" marker redesign | 2a | S | 09 | [ ] |
| P2-11 | Outgoing request: countdown + target ring | 2a | M | 06, 09 | [ ] |
| P2-12 | Incoming request card | 2a | M | 02, 09 | [ ] |
| P2-13 | Chat panel layout | 2a | L | 02 | [ ] |
| P2-14 | Chat "ended" state | 2a | M | 13 | [ ] |
| P2-15 | Video panel redesign | 2a | L | 13 | [ ] |
| — | *Phase 4 feature, built in the new style* | P4 | — | 2a done | — |
| P2-16 | Motion pass + reduced motion | 2b | M | 2a done | [ ] |
| P2-17 | Accessibility pass | 2b | M | 2a done | [ ] |
| P2-18 | Empty states + copy pass | 2b | S | 2a done | [ ] |
| P2-19 | Branding: favicon, metadata, OG image | 2b | S | 01 | [ ] |
| P2-20 | Real-device QA | 2b | M | 16–18 | [ ] |
| P2-21 | NOTES.md Phase 2 section | 2b | S | all | [ ] |

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
  | Display font | Space Grotesk | wordmark, headings |
  | Body font | Geist | everything else |

  Amber over coral so "connect" and "end" never look alike.

### P2-02 · Design tokens + base styles
- **Files:** `app/globals.css`, `app/layout.tsx`
- **Do:** colors / surfaces (glass) / radii / shadows / motion durations in `@theme`; remove `body { font-family: Arial }` (it overrides Geist); add the display font via `next/font`; drop unused light/dark `:root` vars; safe-area inset variables.
- **Done when:** components can use token classes, and the app renders in the chosen fonts.
- **Note:** nothing uses `vh` (the app is `fixed inset-0`), so no `dvh` change was needed. `viewportFit: "cover"` is deliberately *not* on yet: it lets content run under the notch, so it gets turned on in the first task that actually pads with the `--safe-*` insets (P2-04 / P2-13).

### P2-02b · Shared `Button` component
- **Files:** new `app/components/Button.tsx`
- **Do:** one button with variants: `primary` (amber: Enter, Accept, Send), `secondary` (glass/outline: Decline, Cancel), `danger` (rose: End, End video), `icon` (round: video/mic/camera toggles). Sizes sm / md / lg; shared hover, press, disabled and focus styles; passes through native `<button>` props.
- **Why:** five components each hardcode their own button classes today; restyling them separately would drift. Screen tasks (06, 08, 11–15) swap in `<Button variant=…>` instead.
- **Done when:** the component exists and is used by the first screen task that needs it (no screen is migrated in this task itself).

### P2-03 · Restyle the Mapbox map
- **Files:** `app/components/WorldMap.tsx`
- **Do:** after `load`, `setPaintProperty` on water / land / borders / labels to match the palette; `setFog` for horizon glow + starfield. Optional: compare Mapbox Standard (night preset) and switch only if clearly better.
- **Done when:** the map reads as part of the design, not stock `dark-v11`.

### P2-04 · Header: wordmark + online count
- **Files:** `app/page.tsx`, `app/components/WorldMap.tsx` (move the counter out), new `app/components/Header.tsx`
- **Do:** wordmark + live "N online" with a small heartbeat indicator; replaces the bottom-left pill. If this is the first task to pad with `--safe-top`, turn on `viewportFit: "cover"` in `layout.tsx` here.
- **Done when:** the header is visible on the map screen at desktop and mobile widths and doesn't block map gestures.

### P2-05 · Toast queue (fixes Task 8)
- **Files:** `app/page.tsx`, new `app/components/Toasts.tsx` (hook + view)
- **Do:** `useToasts` with a per-toast id and timer (fixes the overlapping timers in `showNotice`); info / error variants; max 2–3 stacked; `aria-live="polite"`; enter/exit animation.
- **Done when:** two notices in quick succession each get their full duration, and the earlier timer no longer clears the newer one.

### P2-06 · Status pill + session-expired banner
- **Files:** `app/page.tsx`
- **Do:** one persistent status slot for "Requesting…" and "Waiting for video…" (now kept separate from toasts, which sat at the same `top-20` spot); "Session expired" becomes a banner with a Reload button.
- **Done when:** status and toasts never overlap, and the expired state has a way out.

## Phase 2a — Screens

### P2-07 · Keep map mounted behind the gate
- **Files:** `app/page.tsx`, `app/components/WorldMap.tsx`, `app/components/EntryGate.tsx`
- **Do:** render `WorldMap` from the start (world view, slow rotation) with the gate as an overlay; on enter, `flyTo` the user's location instead of re-initializing the map.
- **Done when:** gate → live is one continuous camera move with no map reload, and polling/presence still start only after join.

### P2-08 · Entry screen redesign
- **Files:** `app/components/EntryGate.tsx`
- **Do:** wordmark + tagline over the globe; three trust points (no account · fuzzed 1–3 km · nothing stored); designed locating / error states, including how to re-enable denied location.
- **Done when:** all states (idle, locating, denied, unsupported, server error) look intentional.

### P2-09 · Dot redesign
- **Files:** `app/globals.css`, `app/components/WorldMap.tsx`
- **Do:** replace random `dotColor()` hues with state styling (available = accent glow, busy = hollow and dimmed + not-allowed cursor); heartbeat (double-beat) pulse; scale-in on join, fade-out on leave; `aria-label` instead of `title` only.
- **Done when:** the state of every dot is readable at a glance, and dots don't pop in or out.

### P2-10 · "Me" marker redesign
- **Files:** `app/components/WorldMap.tsx`, `app/globals.css`
- **Do:** replace the 📍 emoji with a designed marker (distinct from peers, consistent across OSes).
- **Done when:** it looks the same on Windows / macOS / iOS / Android.

### P2-11 · Outgoing request: countdown + target ring
- **Files:** `app/page.tsx`, `app/components/WorldMap.tsx`
- **Do:** countdown ring tied to `REQUEST_TIMEOUT_MS` in the status pill; animated ring on the target dot; Cancel stays one tap away.
- **Done when:** the user can see who they're calling and how long is left.

### P2-12 · Incoming request card
- **Files:** `app/components/ConnectionPrompt.tsx`, `app/page.tsx`
- **Do:** a card that doesn't block the map (no black overlay); fly to / highlight the requester's dot; flash the tab title when the tab is hidden; reuse it for the incoming-video prompt.
- **Done when:** a request is noticeable even in a background tab, and the map stays visible.

### P2-13 · Chat panel layout
- **Files:** `app/components/ChatPanel.tsx`
- **Do:** turn on `viewportFit: "cover"` (if P2-04 hasn't) and pad with `--safe-bottom`; floating glass panel on desktop, bottom sheet on mobile; stranger avatar in their dot color; grouped bubbles; inline system lines ("Connected · peer-to-peer"); Video / End as icon buttons.
- **Done when:** the map stays partly visible on desktop, and on mobile the input isn't covered by the on-screen keyboard.

### P2-14 · Chat "ended" state
- **Files:** `app/page.tsx` (new `Conn` kind), `app/components/ChatPanel.tsx`
- **Do:** when the stranger leaves or the connection fails, keep the messages in memory and show "Chat ended · Back to map" instead of the instant wipe in `teardown()`.
- **Done when:** a disconnect never yanks the conversation away mid-read, and nothing is persisted.

### P2-15 · Video panel redesign
- **Files:** `app/components/VideoPanel.tsx`, `app/page.tsx`, possibly `lib/webrtc.ts` (track toggles)
- **Do:** mic / camera toggles (`track.enabled`); mirrored local preview; draggable picture-in-picture; chat reachable during the call; move the "waiting for video" pill off the chat input.
- **Done when:** a full call (request → accept → toggle mic/cam → end → back to chat) works on desktop and mobile.

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

### P2-21 · NOTES.md Phase 2 section
- Direction and why · kept Mapbox and restyled it at runtime · UX fixes (toast queue, ended state, request countdown) · what's next. Before/after screenshots if there's room.

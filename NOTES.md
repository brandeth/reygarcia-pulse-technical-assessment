# Notes

## Phase 1 — Make it run

Found mainly by reading the presence → signaling → WebRTC flow end to end,
then confirming each bug with two browser windows (normal + incognito,
different mock geolocations).

- **Chat messages never arrived.** The sender wrapped messages as
  `{ t: "msg" }` but the receiver only accepted `t: "chat"`. Aligned the sender.

- **Stale dots stayed on the map.** The poll heartbeat used
  `updateMany({ where: {} })`, refreshing *every* row's `lastSeen`, so one
  active user kept everyone alive. Scoped it to the caller's id.

- **Users became permanently "busy".** `accept` marked both peers busy but
  only `decline` cleared it, so after the first chat both were auto-declined
  forever. `end` now clears busy too.

- **Some connections never established.** Queued ICE candidates were applied
  *before* `setRemoteDescription`, so they failed silently or were dropped.
  This often hit because polling delivers the offer and its candidates in the
  same batch. Now flushed after the remote description is set.

- **Partner left but chat stayed "Connected".** Data-channel close wasn't
handled and `/api/leave` didn't notify the partner. Wired up
`onChannelClose`, and leave now sends `end` and frees the partner's busy flag.

  - *Regression caught while testing Phase 1:* the partner-notify change
  accidentally dropped the presence `deleteMany` from `/api/leave`, so
  closed tabs lingered on the map until stale reaping. Restored it.

- **Dots drifted while panning.** Mapbox positions each marker by writing an
inline `transform` on the marker element every frame, but our CSS put
`transition: transform` on that same element, so dots eased after the map
instead of sticking to it (and the hover `scale` was overridden by the
inline style). Moved the dot's visuals and hover scale to an inner
`.pulse-dot-core` element and left the marker element unstyled.

- **Missing Mapbox token failed silently.** `WorldMap` fell back to a
hardcoded fake token when `NEXT_PUBLIC_MAPBOX_TOKEN` was unset. Because
it was a non-empty string, the existing `!TOKEN` guards never fired: the
map loaded with an invalid token (401s from Mapbox, blank gray map) and
the setup hint never showed. Changed the fallback to `""` so a missing
token shows the hint instead. (An *invalid* but present token, e.g. the
`.env.example` placeholder, still fails at Mapbox — validating it would
need a network call, out of scope.)

## Phase 2 — Make it good

**Direction: "Night signal."** Pulse is pitched as a living globe of
strangers, so the look is the Earth at night: an ink-navy map, dots that
glow like city lights, and one warm amber accent. Amber rather than coral
so "connect" and "end" (rose red) never look alike. Space Grotesk for the
wordmark and headings, Geist for everything else. Kept Mapbox and restyle
it at runtime instead of swapping the provided map library.

- **Design tokens first.** Colors, glass surfaces, radii, shadows and
  easing live in Tailwind's `@theme` (`globals.css`), so every screen
  shares one palette instead of hardcoded `zinc-*`/`emerald-*` classes.
  Replaced the unused light/dark boilerplate: the app is dark-only.
- **Fonts never loaded visually.** `body { font-family: Arial }` overrode
  the Geist font that `layout.tsx` downloads, so the whole app rendered in
  Arial. Removed it and added Space Grotesk as the display face.
- Small base polish: `color-scheme: dark` (native scrollbars/controls),
  an amber `:focus-visible` ring for keyboard users, and a `theme-color`
  meta so the mobile browser bar matches the app.

- **One shared `Button`.** Each screen hardcoded its own button classes
  (different padding, hovers, disabled states). `app/components/Button.tsx`
  now owns them: primary / secondary / danger variants and sm / md / lg /
  icon sizes, with shared press, disabled, focus and reduced-motion
  behavior. It defaults to `type="button"` (only Send submits the chat
  form), and icon-only buttons require an `aria-label` at the type level.

- **Map restyled, still Mapbox.** Kept the provided `dark-v11` style and
  recolored it at runtime (`lib/map-theme.ts`) instead of switching map
  libraries: every layer is recolored by role (ink water, navy land,
  quiet roads and borders, muted labels) so the dots are the brightest
  thing on screen. The style's flat black fog became a night sky with a
  navy atmosphere rim and stars, which makes the "living globe" visible
  at world zoom. Applied on `style.load` so the stock gray never flashes.

- **Header with a live count.** Replaced the bottom-left "N online" pill
  with a header: the wordmark plus a glass status pill. Its dot is a
  still gray when you're alone and turns green with a double "lub-dub"
  heartbeat (the brand motif behind "Pulse") when someone else is
  online, so it tells you at a glance whether there's anyone to connect
  with. Green, not the amber accent: I split brand from status, so amber
  means "you can act on this" (dots, primary buttons) and green means
  "live / connected", the convention people already read from chat apps.
  Fixed the copy while there: the poll excludes the caller, so a user
  alone on the map saw "0 online", as if nobody was there, themselves
  included. It now reads "Just you right now" / "N strangers online".
  The old pill also covered the Mapbox logo, which has to stay visible.

- **Toasts, and a deferred Phase 1 bug.** `showNotice` stored one message
  in a single slot and started a 3.5 s timer that cleared *the slot*, so
  an older timer wiped newer notices early: a notice shown 3 s after
  another lasted 0.5 s, and "Session expired" could be erased by a
  leftover timer, leaving a dead page with no explanation. Replaced it
  with a small toast queue (`app/components/Toasts.tsx`): each toast owns
  its own timer, up to 3 stack, errors (network, camera, session) get a
  rose variant, and an always-mounted polite live region announces them
  to screen readers. Measured: a toast fired 3 s after another now keeps
  its full 3.5 s.

- **Status vs. toasts.** "Requesting connection…" and the video-request
  message were separately positioned pills that could overlap toasts.
  They're now status pills in the same column as toasts (status on top,
  toasts below), split by meaning: status lasts as long as the state,
  toasts report a moment. Video requests also had no way out: if the
  other person never answered, you waited forever. Added Cancel, which
  reuses the existing `video-end` control to close their prompt.

- **Expired session.** A rejected token stops polling, so the map goes
  dead. Instead of a toast saying "reload", a blocking card explains it
  and focuses a Reload button. Trade-off: if it fires mid-chat it covers
  a peer-to-peer chat that still works, but that only happens when the
  server secret rotates.

- **The globe is the first thing you see.** The entry screen used to be a
  black page, and entering mounted the map from scratch. Now the map is
  mounted from the first frame, so the gate floats over a slowly spinning
  night globe, and entering flies the camera down to you on the same map
  instance: "drop onto the map", literally. The tiles also load while you
  read, so entering feels instant. Visitors on the gate still make no API
  calls and are invisible to others. Moved setting the user's location to
  *after* a successful join, so a failed join no longer drops a pin.
  Reduced motion: no spin, and the flight becomes a jump. Trade-off: every
  page view now counts as a Mapbox map load, not just every join.

- **Entry screen.** Over the spinning globe, the map's labels clashed with
  the gate's text, so the globe now shows no labels behind the gate (each
  layer's own opacity is saved and restored) and place names fade in as
  the camera lands. The gate itself: a radial scrim, a large wordmark, the
  amber Enter button, and three trust points that answer "is this safe?"
  before you tap (no account, dot fuzzed 1–3 km, nothing stored). Errors
  now say what to do, not just what failed (e.g. denied location explains
  how to re-allow it), and the button says "Joining…" during the server
  call instead of "Locating…". The gate dissolves as the camera flies in.

- **Dots, and a busy-state bug.** Busy dots flashed back to "available"
  whenever you panned or zoomed, then went busy again a second later.
  Found it in Mapbox's source: `Marker._evaluateOpacity()` rewrites the
  marker element's inline `opacity` on every camera move (to fade dots
  behind the globe), and our busy style was inline opacity on that same
  element, so it only came back on the next poll. Same lesson as the
  Phase 1 drift fix: Mapbox owns the marker element's inline styles.
  State is now a `data-busy` attribute styled on an inner element.
  The redesign itself: dots show state instead of random colors (amber
  glow and heartbeat = available, hollow gray ring = busy), twinkle out
  of sync, animate in and out, and the pulse animates transform/opacity
  instead of repainting a box-shadow. Tapping a busy dot used to send a
  request that was auto-declined ("Request declined", which was
  misleading); it now sends nothing and says they're in another chat.

## Phase 3 — Security

- **Anyone could act as anyone (critical).** The session id was the only
  credential, and `/api/poll` returns every online id, so any client could
  poll (draining someone's mailbox), signal, leave or rejoin as another user.
  Confirmed by calling `/api/leave` with another window's id from DevTools:
  their dot vanished.
  Fix: the server now issues `{ id, token }` on join, where
  `token = HMAC-SHA256(SESSION_SECRET, id)` (`lib/auth.ts`). Every route
  verifies it with `timingSafeEqual`. Poll and signal send it in an
  `x-pulse-token` header (kept out of URLs/logs), and leave sends it in the
  body because `sendBeacon` can't set headers. Signal also checks the token
  against `fromId` and rejects bad or self-addressed `toId`s. The client keeps
  the token in memory only, so closing the tab still ends the session.
  - *Trade-offs:* tokens are stateless and don't expire on their own;
    rotating `SESSION_SECRET` invalidates all of them (the client shows "Session expired, reload.").

- **Any user could freeze or free anyone (high).** `/api/signal` trusted
  every busy change: `accept` marked any two ids busy, `end`/`decline` freed
  anyone, `offer`/`ice` could go to strangers, and `/api/leave` sent `end`
  to whatever `peerId` the client passed. Confirmed by sending `accept` to
  another window's id from DevTools: they went busy and everyone else was
  auto-declined.
  Fix: `Presence.peerId` (nullable, server-set) records who you requested
  or are connected to. Each signal type is checked against stored state and
  anything else gets 409: `accept`/`decline` need a real request,
  `offer`/`answer`/`ice` need an active pairing, and `end` needs
  `sender.peerId === toId`. That last rule deliberately also allows
  cancelling a pending request, which the client does with `end`.
  `/api/leave` now finds partners from `peerId` in both directions, frees
  them and sends them `end`. The client also sends `end` when WebRTC fails
  or the channel closes, so a dropped connection doesn't leave both users
  busy.
  - *Trade-offs:* checks are read-then-write without a transaction
    (interactive transactions are unreliable over the PgBouncer pooler), so
    a cancel racing an accept can leave a stale pairing until someone
    leaves or goes stale. A requester reaped mid-request leaves the
    target's Accept going nowhere (409, UI stuck on "connecting"). Request
    spam isn't rate-limited.

- **No limits on sessions or signals (medium).** A script could create
  unlimited sessions (fake dots on the map), send unlimited signals, and
  spam one user with requests.
  Fix: a `RateLimit` table that counts calls per minute (`lib/rate-limit.ts`).
  - Join: 10 new sessions/min per IP.
  - Signals: 120/min per session.
  - Requests: 10/min per session.
  - Mailbox: 100 pending signals per recipient.
  Going over a limit returns 429. `/api/poll` deletes old counters.  
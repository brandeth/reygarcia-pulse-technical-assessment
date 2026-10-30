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

- **"You" marker.** Your own position was a 📍 emoji, which every OS draws
  differently and which didn't belong next to the glowing dots. It's now a
  steady white light with a ring and a small glass "You" label: white, not
  amber, because amber means "tap this" and you can't tap yourself, and no
  heartbeat, so you're easy to find among twinkling strangers. It stacks
  above nearby dots. While wiring its accessibility I found that Mapbox
  stamps `role="img"` on any marker element without a role, so the peer
  dots (real `<button>`s) were announced to screen readers as images; they
  now set `role="button"` explicitly.

- **Landing closer.** Testing with a friend a few km away, their dot sat
  directly under my marker at the old landing zoom (country level), so
  the header said "1 stranger online" but nobody was visible until I
  zoomed in. The fly-in now lands at city level (zoom 11), where people a
  few km apart are clearly separate dots. Trade-off: strangers further
  than roughly 20 km away start off-screen; zooming out finds them.

- **Waiting for an answer.** A request silently expired after 30 s with
  only a spinner, and once you'd tapped, the person's dot looked like
  everyone else's. Now the status pill shows a ring that empties over
  exactly the 30 s timeout (a CSS animation, no per-second re-renders;
  measured in sync with the real timer), and the dot you called gets a
  slowly orbiting dashed ring until they answer, decline, or it times out.

- **Getting a request.** The incoming prompt was a modal that blacked out
  the map, so you couldn't see who was asking, and in a background tab
  the 30 s request usually expired unseen. It's now a card at the bottom
  that leaves the map visible: the caller's dot gets the same orbiting
  ring (and the camera flies to it if it's off-screen, since a request
  can come from anywhere), the card shows the time left, and a hidden
  tab flashes its title ("● Someone wants to connect") until it's seen.
  The video request uses the same card, centered beside the chat.

- **Chat.** The chat was a full-height black drawer that hid the map on
  desktop and the whole screen on phones. On desktop it's now a floating
  glass panel beside the map; on phones it's a bottom sheet that leaves
  the top of the map in view. The stranger gets an avatar drawn like
  their dot, "Connected" uses the green live color, consecutive messages
  group into blocks, and a quiet line says messages are peer-to-peer and
  never stored. Mobile details: the app now draws edge to edge on notched
  phones with every bottom-anchored control padded clear of the home bar,
  Android shrinks the layout when the keyboard opens, and the input is
  16px so iOS doesn't zoom into it.

- **When the other person leaves.** Their leaving wiped the conversation
  instantly (`teardown()` cleared the messages and closed the panel), so
  a goodbye you were still reading vanished mid-sentence. Now the
  connection still closes at once (you're free on the map again right
  away) but the conversation stays on screen, marked "Chat ended" with a
  line saying what happened, until you tap "Back to map". Still memory
  only: dismissing it clears it for good. Ending it yourself closes it
  immediately, as before, and a new request or tapping someone replaces
  it.

- **Video calls.** Video took over the whole screen in black, hiding the
  chat, with only an "End video" button. Now, on desktop, the call fills
  the map area and the chat stays beside it; on phones it's full screen
  with a Chat button that shrinks it to a small floating tile above the
  chat sheet. Mute and camera-off just disable the outgoing track (no
  renegotiation; verified the other side receives black frames) and turn
  their buttons red so you never forget you're muted. Your own preview is
  mirrored, like every camera app, and can be dragged to any corner,
  where it glides into place.

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

## Phase 4 — Make it better

**Connection arcs.** When two people connect anywhere, a light arc draws
between their dots across the globe and stays while they talk, so the map
shows a globe being used, not just dots sitting still.

- **The server tells the map who is talking.** `/api/poll` now returns
  `pairs`: live chats as `[idA, idB]`. A pair counts only when both rows
  are busy and their `peerId`s point at each other, which happens once a
  request is accepted. A pending request points one way only, so who is
  calling whom never leaves the server before the other person agrees.
  Only ids are sent: the client already has every dot's fuzzed position,
  and `peerId` itself stays server-side. Your own chat is included, so
  the poll now reads the caller's row too (one query instead of a second
  lookup).
  - *Privacy trade-off:* anyone can now see that two busy dots are
    talking to each other, not just that both are busy. Both ends are
    already fuzzed 1–3 km and anonymous, so I judged that acceptable for
    the effect.
  - *Verified* with three scripted sessions: no pair while idle or while
    a request is pending; the pair appears for everyone after accept,
    disappears after `end` and after `/api/leave`; `peerId` never appears
    in the response.

- **Arcs follow the globe.** Mapbox draws a two-point line straight in
  Mercator, which on the globe bends off the real shortest route (Tokyo →
  San Francisco would cross Asia and Europe instead of the Pacific).
  `lib/arcs.ts` samples the great circle itself: both dots become vectors
  from the Earth's center, and spherical interpolation walks between them
  at constant speed. Longitudes are unwrapped (178° → 188°, not → -172°) so
  an arc over the antimeridian doesn't become a line around the world. No
  turf dependency for ~60 lines of math.
  - Every arc gets 65 points, even dots 3 km apart, so the draw-in
    animation takes the same time for every arc.
  - *Verified* with a script: Tokyo → San Francisco peaks at 48.6° N over
    the North Pacific, Manila → London passes over Central Asia, Fiji →
    Samoa crosses the antimeridian without a jump; every route's length
    equals the great-circle distance, with evenly spaced points.

- **Arcs rise off the map in 3D.** Tilting the map (Ctrl + drag) showed
  the arcs were still painted flat on the ground. I first tried Mapbox's
  own raised lines (`line-z-offset`, height varying along the line), and
  dropped them:
  - Mapbox's renderer skips raised lines entirely on the globe
    projection (`if (layer.hasElevatedBuckets && projection === "globe")
    return;` in its draw code), so the arcs vanished.
  - Even on a flat projection, the raised arc was clipped apart at tile
    edges: Mapbox draws a GeoJSON line tile by tile and clips each piece
    to its tile, and a raised line falls outside its tile's ground area
    on screen. Which half disappeared changed with the camera.
  So `lib/arc-3d.ts` is a custom WebGL layer: Mapbox hands it the camera
  matrix, and it draws each arc as a ribbon of triangles with real height
  (25% of the arc's length, capped at 300 km), touching the ground at
  both dots. The vertex shader widens each segment in screen pixels, so
  the line keeps the same width at any tilt or zoom; a soft glow pass and
  a thin core pass match the flat look; the spark becomes a streak that
  fades from tail to head. Vertices are stored relative to a nearby
  origin (moved into the matrix in 64-bit JS), because Mercator
  coordinates span 0–1 for the whole world and 32-bit floats made
  zoomed-in arcs jitter.
  - The custom layer's camera matrix is the flat (Mercator) one, which
    only matches the screen once the globe has flattened out at zoom 6.
    So below zoom 6 the flat arc layers draw (you look straight down at
    a ball there, so height wouldn't show), and the two cross-fade over
    zoom 6–7. The animation, draw-in, sparks and fades are shared: one
    loop feeds both.
  - *Found in final testing:* tilted at zoom 6.8, a long arc showed as
    two lines, the raised one and a dim flat one on the ground. The flat
    layers' opacity mixes zoom with per-arc data, and Mapbox evaluates
    such expressions at whole zoom levels and blends in between, so my
    6 → 6.5 fade really ran 6 → 7. The fade now spans exactly 6 → 7, and
    the raised arc's height also scales with it (cubed), so during the
    fade it lies on top of the flat line instead of floating above it.
  - **The arch stands straight up, and rises with the tilt.** Seen from
    directly above, a raised arch appeared to lean away from the screen
    centre (Mapbox's camera has perspective), so the top view showed a
    curve that was really a leaning arch. Now the height follows the
    map's pitch: flat from above, so the top view is a straight line
    between the two dots, rising to full height by 50° (one shader
    uniform, so tilting rebuilds nothing). An earlier sideways bow I'd
    added for the top view is gone too: it tipped the whole arch north.
  - *Trade-offs:* about 300 lines of WebGL instead of a style property;
    the arcs are light, so they don't hide each other or the map (no
    depth test).
  - *Verified* in the browser with my arc to a stranger 5 km east: top
    view a straight line between the dots; 25° gently lifted; 60° and
    72° (rotated) an upright arch landing on both dots; on the globe
    (zoom 3) the flat layers draw and nothing errors; the spark was
    caught as a streak; no console errors or warnings.

- **Arcs on the map.** `lib/arc-layer.ts` adds a GeoJSON source and four
  layers under the labels: a blurred glow and a thin core for the lines,
  and a two-layer "spark" that travels along each arc every few seconds.
  A new chat's arc draws itself in from one dot to the other (1.2 s),
  stays lit while they talk, and fades out (0.6 s) when the chat ends.
  Green, not amber: it's a live status, not something you can tap. Your
  own chat's arc starts at "You" and is brighter than strangers' arcs.
  - Mapbox paint properties apply to a whole layer, so a per-arc draw-in
    can't use `line-trim-offset`. Instead one `requestAnimationFrame` loop
    rewrites the source data (`setData`) each frame, and only runs while
    something moves; when nobody is chatting it stops completely.
  - Chats already going when you enter fade in instead of drawing in, so
    entering doesn't animate every arc at once. Under reduced motion,
    arcs only fade in and out, with no draw-in and no sparks.
  - Capped at 100 arcs so a very busy map stays smooth.
  - *Verified* in the browser with scripted sessions: two strangers near
    Manila connecting drew an arc between their (now busy) dots; a Tokyo
    ↔ San Francisco chat curved over the Pacific on the globe; a stranger
    who requested me and was accepted got a brighter arc from "You"; arcs
    cleared when chats ended or the other side left; no console errors.
    The 1.2 s draw-in was caught part-drawn in one frame, but the
    screenshot tool can't sample fast enough to time it.

- **The connect moment.** When a chat starts, a green ripple with a
  fainter echo (the "lub-dub" again) spreads from the dot the arc leaves,
  and another from the far dot just as the line reaches it, so a
  connection reads as something travelling from one person to the other.
  Your own arc always leaves from "You". The ripple is a short-lived child
  element of the marker (Mapbox owns the marker element's own inline
  styles, same lesson as the dot fixes in Phase 1 and 2), so it follows
  the dot and fades with it behind the globe. No ripples for chats that
  were already running when you entered, and none under reduced motion.
  - *Verified* by logging ripple elements with a MutationObserver while
    scripted strangers connected: start dot at 0 ms, far dot at +1206 ms
    (draw-in is 1200 ms), each removed after 1.1 s, one per end; my own
    chat rippled on "You" first; entering while a chat was running gave
    no ripple.

- **The header counts chats too.** The status pill now reads e.g. "5
  strangers online · 2 chats": one per arc on the map, yours included,
  from the same `pairs` the arcs use, so the two always agree. It's
  quieter (muted) than the online count and hidden when nobody is
  talking, since "0 chats" is noise.
  - *Bug found while testing it:* an arc that had just finished drawing
    in stayed at its last in-between frame (64 of 65 points). The
    animation only pushed new data while something was animating, and
    the frame where the draw-in finishes no longer counts as animating.
    It now pushes one more frame after the animation settles (same for
    the end of a fade-in).
  - *Verified* by logging the header every 0.5 s while scripted
    strangers joined, connected, ended and left: 3·2 → 5·2 → 4·1 (my
    caller left) → 4·2 → 4·1 → 2·1, always matching the arcs on the
    map; fits on one line at 375 px.

- **How the whole feature was tested.** WebRTC needs two people, but the
  arcs only need the server to think two people are chatting, so most
  testing used small Node scripts that join as fake strangers, poll to
  stay alive, request / accept / end through the real API, and leave.
  That made each case repeatable: a pair connecting near me, a Tokyo ↔
  San Francisco pair, a stranger requesting me, a chat already running
  when I enter, chats ending and tabs closing. In the page, a
  MutationObserver timed the ripples, and reading the arc source showed
  draw-in, fades and point counts frame by frame. Reduced motion was
  checked by stubbing `matchMedia` before the map loaded (arc appears
  whole and fades in over 0.6 s, no sparks, no ripples); phone width by
  emulating 375 × 812 (header fits, arc and 3D arch render).
  - *Not yet checked:* real phones and weaker GPUs (the 3D layer is
    WebGL 2), and a full run on the Vercel URL with real WebRTC between
    two devices. Both are part of the final Phase 2 device QA.
  - *Known gap:* on phones the chat opens as a bottom sheet that covers
    "You", so your own arc is hidden while you chat. The fix is to pad
    the camera by the sheet's height while chatting (already noted as a
    Phase 2 follow-up).

**What I'd do next with more time**

- *Safe:* consent-first video (the other person's video starts blurred
  until you choose to reveal it, protecting you from what's sent to you)
  and "Leave & block" (the server stops that session from requesting you
  again, for as long as either session lives, so nothing persists).
- *Alive:* intent tags on dots ("can't sleep", "practice a language",
  from a fixed list so nobody can put personal details on the map),
  a day/night line on the globe with "it's 3 am for them" in the chat
  header (time zone sent peer-to-peer), and a shared heartbeat: hold to
  send your pulse, their avatar beats in your rhythm.
- *Arcs:* raised 3D arcs on the globe view too (custom layers get the
  globe matrices from Mapbox; it means drawing in two projections), and
  frame both people above the phone's chat sheet.
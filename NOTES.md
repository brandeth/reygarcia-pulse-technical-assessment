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
    rotating `SESSION_SECRET` invalidates all of them (the client shows
    "Session expired, reload."). A valid user can still send signals to
    any id. That's tracked as a separate issue.
  
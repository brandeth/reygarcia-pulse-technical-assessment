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

  - **Dots drifted while panning.** Mapbox positions each marker by writing an
  inline `transform` on the marker element every frame, but our CSS put
  `transition: transform` on that same element, so dots eased after the map
  instead of sticking to it (and the hover `scale` was overridden by the
  inline style). Moved the dot's visuals and hover scale to an inner
  `.pulse-dot-core` element and left the marker element unstyled.
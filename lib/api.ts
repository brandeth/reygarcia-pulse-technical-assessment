// Client-side helpers for talking to the coordination API.
import type { JoinResponse, PollResponse, SignalType } from "@/lib/types";

// The server-issued session. Memory only (not localStorage) so closing the
// tab ends the session for good.
let session: JoinResponse | null = null;

// Thrown when the server rejects our token, so the UI can stop and ask for a
// reload instead of retrying forever.
export class SessionExpiredError extends Error {}

function authHeaders(): Record<string, string> {
  return session ? { "x-pulse-token": session.token } : {};
}

// First call creates a session; later calls (rejoin after our row was
// reaped) send the stored id + token so the server keeps the same id.
export async function join(lat: number, lng: number): Promise<string> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...session, lat, lng }),
  });
  if (res.status === 401) throw new SessionExpiredError();
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  session = (await res.json()) as JoinResponse;
  return session.id;
}

export async function poll(id: string): Promise<PollResponse> {
  const res = await fetch(`/api/poll?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  if (res.status === 401) throw new SessionExpiredError();
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

export async function sendSignal(
  fromId: string,
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<void> {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ fromId, toId, type, payload }),
  });
}

// Fire-and-forget leave that survives the tab closing.
export function leave(id: string): void {
  const body = JSON.stringify({ id, token: session?.token });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/leave", body);
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }
}

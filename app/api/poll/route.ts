import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import type { PollResponse } from "@/lib/types";
import { verify } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poll?id= (+ x-pulse-token header) — the single endpoint that drives the live map.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the filtered online peers, and (4) drains this user's mailbox.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");

  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  // Token rides in a header so it never lands in URLs or access logs.
  if (!verify(id, request.headers.get("x-pulse-token"))) {
    return Response.json({ error: "invalid session" }, { status: 401 });
  }

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  // 1) Heartbeat — refresh lastSeen for the caller. count === 0 means the
  // caller's row was reaped (or never created); the client will rejoin.
  const heartbeat = await prisma.presence.updateMany({
    where: { id },
    data: { lastSeen: new Date(now) },
  });

  // 2) Reap stale presence rows, orphaned signals and expired rate-limit
  // windows (independent deletes — no atomicity needed, and avoids
  // transactions over a PgBouncer pooler).
  await prisma.presence.deleteMany({
    where: { lastSeen: { lt: staleCutoff } },
  });
  await prisma.signal.deleteMany({
    where: { createdAt: { lt: signalCutoff } },
  });
  await prisma.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date(now) } },
  });

  // 3) Everyone online, including the caller: their own chat is a pair too.
  const online = await prisma.presence.findMany({
    where: { lastSeen: { gte: staleCutoff } },
    select: { id: true, lat: true, lng: true, busy: true, peerId: true },
  });
  const peers = online.filter((p) => p.id !== id);

  // Live chats: both busy and pointing at each other. A pending request
  // only points one way, so who is calling whom never leaves the server.
  // Each pair is emitted once, from its smaller id.
  const byId = new Map(online.map((p) => [p.id, p]));
  const pairs: [string, string][] = [];
  for (const p of online) {
    if (!p.busy || !p.peerId || p.id > p.peerId) continue;
    const other = byId.get(p.peerId);
    if (other?.busy && other.peerId === p.id) pairs.push([p.id, other.id]);
  }

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const response: PollResponse = {
    self: heartbeat.count > 0,
    // Explicit fields, so peerId stays server-side.
    peers: peers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      busy: p.busy,
    })),
    pairs,
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as PollResponse["signals"][number]["type"],
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return Response.json(response);
}

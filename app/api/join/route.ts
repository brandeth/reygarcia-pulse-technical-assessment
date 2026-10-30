import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { newSession, offsetSeed, verify } from "@/lib/auth";
import type { JoinResponse } from "@/lib/types";
import { clientIp, overLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { lat, lng } (raw coords) for a new session, or
// { id, token, lat, lng } to rejoin after our row was reaped. The server
// issues the id + signed token; the client never picks its own id.
// Applies a 1–3 km privacy offset, seeded per session so a rejoin lands on
// the same point, and upserts the presence row. Raw coordinates are never
// stored.
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { id, token, lat, lng } = (body ?? {}) as Record<string, unknown>;

  if (!isValidLatLng(lat, lng)) {
    return Response.json({ error: "invalid coordinates" }, { status: 400 });
  }

  let session: JoinResponse;
  if (id === undefined && token === undefined) {
    // Only new sessions are limited: they're what fills the map with dots.
    // A verified rejoin just re-creates the caller's own row.
    const limited = await overLimit("join", clientIp(request), 10);
    if (limited) return limited;
    session = newSession();
  } else if (verify(id, token)) {
    session = { id: id as string, token: token as string };
  } else {
    return Response.json({ error: "invalid session" }, { status: 401 });
  }

  const offset = applyPrivacyOffset(
    lat as number,
    lng as number,
    offsetSeed(session.id),
  );

  await prisma.presence.upsert({
    where: { id: session.id },
    create: {
      id: session.id,
      lat: offset.lat,
      lng: offset.lng,
      busy: false,
      lastSeen: new Date(),
    },
    update: {
      lat: offset.lat,
      lng: offset.lng,
      lastSeen: new Date(),
    },
  });

  return Response.json(session);
}

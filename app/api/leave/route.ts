import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verify } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id, token, peerId? }. Removes the presence row and any pending
// signals to/from this user. Called via navigator.sendBeacon on tab close, so
// the body may arrive as text — parse defensively.
export async function POST(request: NextRequest) {
  let id: string | undefined;
  let token: unknown;
  let peerId: string | undefined;
  try {
    const text = await request.text();
    const parsed = text ? JSON.parse(text) : undefined;
    id = parsed?.id;
    token = parsed?.token;
    peerId = parsed?.peerId;
  } catch {
    id = undefined;
  }

  if (typeof id !== "string" || !id) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  // Token is in the body because sendBeacon can't set headers.
  if (!verify(id, token)) {
    return Response.json({ error: "invalid session" }, { status: 401 });
  }

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });

  await prisma.presence.deleteMany({ where: { id } });

  // Notify the partner *after* the deletes above, otherwise the
  // fromId cleanup would wipe this "end" signal before it's delivered.
  if (typeof peerId === "string" && peerId) {
    await prisma.presence.updateMany({
      where: { id: peerId },
      data: { busy: false },
    });
    await prisma.signal.create({
      data: { fromId: id, toId: peerId, type: "end", payload: null },
    });
  }

  return Response.json({ ok: true });
}

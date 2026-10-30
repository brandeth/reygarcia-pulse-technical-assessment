import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verify } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id, token }. Removes the presence row and any
// pending signals to/from this user, and ends any connection or pending
// request they were part of. Who to notify comes from server state, never
// the client. Called via navigator.sendBeacon on tab close, so the body may
// arrive as text — parse defensively.
export async function POST(request: NextRequest) {
  let id: string | undefined;
  let token: unknown;
  try {
    const text = await request.text();
    const parsed = text ? JSON.parse(text) : undefined;
    id = parsed?.id;
    token = parsed?.token;
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

  // Read our links before deleting the row: who we requested or are paired
  // with, plus anyone whose request or pairing points at us.
  const [me, linked] = await Promise.all([
    prisma.presence.findUnique({ where: { id }, select: { peerId: true } }),
    prisma.presence.findMany({ where: { peerId: id }, select: { id: true } }),
  ]);
  const notify = new Set(linked.map((p) => p.id));
  if (me?.peerId) notify.add(me.peerId);

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });

  await prisma.presence.deleteMany({ where: { id } });

  // Free and notify everyone linked to us *after* the deletes above,
  // otherwise the fromId cleanup would wipe these "end" signals.
  await prisma.presence.updateMany({
    where: { peerId: id },
    data: { busy: false, peerId: null },
  });
  if (notify.size > 0) {
    await prisma.signal.createMany({
      data: [...notify].map((toId) => ({
        fromId: id,
        toId,
        type: "end",
        payload: null,
      })),
    });
  }

  return Response.json({ ok: true });
}

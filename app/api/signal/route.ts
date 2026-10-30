import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SignalType } from "@/lib/types";
import { verify } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

const MAX_PAYLOAD = 64 * 1024; // SDP/ICE are small; cap to be safe.

// POST /api/signal — body { fromId, toId, type, payload? }
// Drops one message into the recipient's mailbox. The server owns the
// connection state (busy + peerId) and only delivers a signal that is a valid
// next step from that state, so a client can't pair, free or message
// strangers:
//
//   request           sender not busy              → sender.peerId = toId
//   accept            toId requested sender,
//                     neither busy                 → both busy + paired
//   decline           toId requested sender        → toId.peerId cleared
//   end               sender.peerId === toId       → sender freed (and toId,
//                     (hang up, or cancel request)   if it points back)
//   offer/answer/ice  sender busy + paired with toId
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { fromId, toId, type, payload } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (!isValidId(fromId) || !isValidId(toId) || fromId === toId) {
    return Response.json({ error: "invalid ids" }, { status: 400 });
  }
  if (!verify(fromId, request.headers.get("x-pulse-token"))) {
    return Response.json({ error: "invalid session" }, { status: 401 });
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return Response.json({ error: "invalid type" }, { status: 400 });
  }
  if (
    payload !== undefined &&
    payload !== null &&
    (typeof payload !== "string" || payload.length > MAX_PAYLOAD)
  ) {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }

  const signalType = type as SignalType;
  const payloadStr = typeof payload === "string" ? payload : null;

  const [sender, target] = await Promise.all([
    prisma.presence.findUnique({
      where: { id: fromId },
      select: { busy: true, peerId: true },
    }),
    prisma.presence.findUnique({
      where: { id: toId },
      select: { busy: true, peerId: true },
    }),
  ]);
  // Sender's row was reaped — their next poll rejoins them.
  if (!sender) return conflict();

  switch (signalType) {
    case "request": {
      if (sender.busy) return conflict();
      // Enforce "one active connection at a time": if the target is offline
      // or busy, auto-decline the request instead of delivering it.
      if (!target || target.busy) {
        await sendDecline(toId, fromId);
        return Response.json({ ok: true, autoDeclined: true });
      }
      await prisma.presence.updateMany({
        where: { id: fromId },
        data: { peerId: toId },
      });
      break;
    }
    case "accept": {
      if (!target || target.peerId !== fromId || sender.busy || target.busy) {
        return conflict();
      }
      await prisma.presence.updateMany({
        where: { id: fromId },
        data: { busy: true, peerId: toId },
      });
      await prisma.presence.updateMany({
        where: { id: toId },
        data: { busy: true },
      });
      break;
    }
    case "decline": {
      if (!target || target.peerId !== fromId || target.busy) {
        return conflict();
      }
      await prisma.presence.updateMany({
        where: { id: toId },
        data: { peerId: null },
      });
      break;
    }
    case "end": {
      if (sender.peerId !== toId) return conflict();
      // Paired → free both. Pending request (only sender points) → just the
      // sender; the target was never marked.
      const paired = target?.peerId === fromId;
      await prisma.presence.updateMany({
        where: { id: paired ? { in: [fromId, toId] } : fromId },
        data: { busy: false, peerId: null },
      });
      break;
    }
    case "offer":
    case "answer":
    case "ice": {
      if (!sender.busy || sender.peerId !== toId) return conflict();
      break;
    }
  }

  await prisma.signal.create({
    data: { fromId, toId, type: signalType, payload: payloadStr },
  });

  return Response.json({ ok: true });
}

// Signal doesn't fit the current connection state.
function conflict() {
  return Response.json({ error: "invalid state" }, { status: 409 });
}

// Helper: deliver an auto-decline from `target` back to `initiator`.
async function sendDecline(targetId: string, initiatorId: string) {
  await prisma.signal.create({
    data: {
      fromId: targetId,
      toId: initiatorId,
      type: "decline",
      payload: null,
    },
  });
}

function isValidId(v: unknown): v is string {
  return typeof v === "string" && v.length >= 8 && v.length <= 64;
}

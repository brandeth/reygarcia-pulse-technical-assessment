// Server-only helpers for signed session tokens. The session id is public
// (every poll lists it), so the HMAC token is the actual credential.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Read lazily and fail closed: no secret → every auth check 500s instead of
// silently accepting a default key.
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

export function signId(id: string): string {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

export function newSession(): { id: string; token: string } {
  const id = randomUUID();
  return { id, token: signId(id) };
}

export function verify(id: unknown, token: unknown): boolean {
  if (typeof id !== "string" || typeof token !== "string") return false;
  const expected = Buffer.from(signId(id));
  const given = Buffer.from(token);
  // timingSafeEqual throws on a length mismatch. Checking length first only
  // leaks the length, which is the same for every valid token anyway.
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Two stable values in [0, 1) per session for the privacy offset (lib/geo.ts).
// Keyed with the secret: the id is public, so a plain hash of it would let
// anyone recompute the offset and subtract it from the dot. The "offset:"
// prefix keeps these bytes unrelated to the session token.
export function offsetSeed(id: string): [number, number] {
  const h = createHmac("sha256", secret())
    .update("offset:" + id)
    .digest();
  return [h.readUInt32BE(0) / 2 ** 32, h.readUInt32BE(4) / 2 ** 32];
}

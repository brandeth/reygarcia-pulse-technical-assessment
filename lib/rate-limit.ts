// Fixed-window rate limiting backed by Postgres, so counts are shared across
// serverless instances (in-memory counters would reset per instance).
import { prisma } from "@/lib/prisma";

// Counts one call to `bucket` by `who`. Returns a 429 response once `who`
// is over `limit` in the current window, otherwise null. The window number
// is part of the key, so every window starts a fresh row at 1.
export async function overLimit(
  bucket: string,
  who: string,
  limit: number,
  windowMs = 60_000,
): Promise<Response | null> {
  const slot = Math.floor(Date.now() / windowMs);
  const key = `${bucket}:${who}:${slot}`;
  const expiresAt = new Date((slot + 1) * windowMs);

  // One atomic statement: two concurrent requests can't both read the same
  // count and both slip under the limit.
  const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"
  `;
  if (count <= limit) return null;

  const retryAfter = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
  return Response.json(
    { error: "rate limited" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

// Client IP for per-IP limits. Vercel sets x-forwarded-for itself and
// overwrites any client-sent value, so the first entry is the real client.
// Locally it may be missing; those requests share one "unknown" bucket.
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown"
  );
}

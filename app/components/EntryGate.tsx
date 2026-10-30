"use client";

import { useState, type ReactNode } from "react";
import Button from "./Button";

type Status = "idle" | "locating" | "joining" | "error";
type ErrorKind = "denied" | "unsupported" | "unavailable" | "server";

// What went wrong, and what the user can actually do about it.
const ERRORS: Record<ErrorKind, { title: string; body: string }> = {
  denied: {
    title: "Location is blocked",
    body: "Pulse needs your rough location to place your dot. Allow location for this site (the icon left of the address bar → Location → Allow), then try again.",
  },
  unsupported: {
    title: "This browser can't share location",
    body: "Try a recent version of Chrome, Firefox, Safari or Edge.",
  },
  unavailable: {
    title: "Couldn't find you",
    body: "Your device didn't return a location. Check that location services are on, then try again.",
  },
  server: {
    title: "Couldn't reach Pulse",
    body: "Check your connection and try again.",
  },
};

export default function EntryGate({
  onReady,
  leaving = false,
}: {
  onReady: (lat: number, lng: number) => void | Promise<void>;
  // Set once the join succeeded: the gate fades out while the map flies in.
  leaving?: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ErrorKind | null>(null);
  const busy = status === "locating" || status === "joining";

  function fail(kind: ErrorKind) {
    setStatus("error");
    setError(kind);
  }

  function enter() {
    if (busy) return;
    if (!("geolocation" in navigator)) return fail("unsupported");
    setStatus("locating");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("joining");
        Promise.resolve(
          onReady(pos.coords.latitude, pos.coords.longitude),
        ).catch(() => fail("server"));
      },
      (err) =>
        fail(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable"),
      // High accuracy + maximumAge:0 forces a fresh fix (Wi-Fi/GPS scan)
      // instead of reusing the browser's cached IP-based location.
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  const label =
    status === "locating"
      ? "Finding you…"
      : status === "joining"
        ? "Joining…"
        : status === "error"
          ? "Try again"
          : "Enter Pulse";

  return (
    // An overlay on the spinning globe (the map is mounted behind it). The
    // radial scrim darkens only the middle, so the text reads cleanly while
    // the globe's rim and the stars still glow around it.
    <div
      className={`absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,rgb(7_11_20/0.7)_0%,rgb(7_11_20/0.35)_45%,transparent_75%)] p-6 text-fg ${
        leaving ? "pointer-events-none animate-gate-out" : ""
      }`}
    >
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        <h1 className="font-display text-6xl font-bold tracking-tight sm:text-7xl">
          Pulse
        </h1>
        <p className="mt-3 max-w-sm text-base text-fg/80 sm:text-lg">
          {/* Desktop: one sentence per line. Phones wrap naturally. */}
          A living globe of anonymous strangers.{" "}
          <br className="hidden sm:inline" />
          Drop onto the map and connect.
        </p>

        <Button
          size="lg"
          className="mt-8 min-w-52"
          onClick={enter}
          aria-disabled={busy}
          aria-busy={busy}
        >
          {busy && (
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-on-accent/30 border-t-on-accent motion-reduce:animate-none"
            />
          )}
          {label}
        </Button>

        {status === "error" && error && (
          <div
            role="alert"
            className="mt-6 flex w-full max-w-sm gap-3 rounded-panel border border-danger/40 bg-surface/90 p-4 text-left"
          >
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" />
            <div>
              <p className="text-sm font-semibold">{ERRORS[error].title}</p>
              <p className="mt-1 text-sm text-muted">{ERRORS[error].body}</p>
            </div>
          </div>
        )}

        <ul className="mx-auto mt-10 grid w-fit gap-3 text-left text-sm text-muted sm:w-full sm:grid-cols-3 sm:gap-4 sm:text-center">
          <TrustPoint icon={<UserIcon />}>
            No account.{" "}
            {/* Two lines on desktop, matching the other two points. */}
            <br className="hidden sm:inline" />
            <span className="whitespace-nowrap">No sign-up.</span>
          </TrustPoint>
          <TrustPoint icon={<PinIcon />}>
            Your dot lands <span className="whitespace-nowrap">1–3 km</span> from you.
          </TrustPoint>
          <TrustPoint icon={<ShieldIcon />}>Nothing stored. Close the tab, it&rsquo;s gone.</TrustPoint>
        </ul>
      </div>
    </div>
  );
}

function TrustPoint({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 sm:flex-col sm:gap-1.5">
      <span className="text-fg/70">{icon}</span>
      <span className="text-balance">{children}</span>
    </li>
  );
}

const iconProps = {
  "aria-hidden": true,
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function UserIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
    </svg>
  );
}

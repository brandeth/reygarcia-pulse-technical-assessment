"use client";

import Button from "./Button";
import CountdownRing from "./CountdownRing";

// Card for "someone wants to connect" and "someone wants to start video".
// It sits at the bottom without dimming the screen, so the map (and the
// caller's highlighted dot) stays visible while you decide.
export default function ConnectionPrompt({
  kind,
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
  countdownMs,
  className = "",
  leaving = false,
}: {
  kind: "connect" | "video";
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  // How long until the request expires on the other side, if it does.
  countdownMs?: number;
  className?: string;
  // Answered or withdrawn: playing its exit (usePresence). Inert, so a
  // second tap can't hit a button that's on its way out.
  leaving?: boolean;
}) {
  return (
    <div
      inert={leaving}
      className={`pointer-events-none absolute inset-x-0 bottom-[calc(1.5rem+var(--safe-bottom))] z-30 flex justify-center px-4 ${className}`}
    >
      <div
        role="alertdialog"
        aria-labelledby="prompt-title"
        aria-describedby={subtitle ? "prompt-text" : undefined}
        className={`pointer-events-auto flex w-full max-w-sm flex-col gap-4 rounded-panel border border-line bg-glass p-4 text-fg shadow-panel backdrop-blur-glass ${
          leaving
            ? "animate-card-out motion-reduce:animate-fade-out"
            : "animate-card-in motion-reduce:animate-none"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="relative grid size-11 shrink-0 place-items-center">
            {countdownMs && (
              <CountdownRing ms={countdownMs} className="absolute inset-0 size-11" />
            )}
            {kind === "connect" ? (
              // The caller, drawn like their dot on the map.
              <span aria-hidden className="size-3 rounded-full bg-accent shadow-glow" />
            ) : (
              <VideoIcon />
            )}
          </span>
          <div className="min-w-0">
            <h2 id="prompt-title" className="font-display text-base font-semibold">
              {title}
            </h2>
            {subtitle && (
              <p id="prompt-text" className="text-sm text-muted">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onDecline}>
            {declineLabel}
          </Button>
          <Button className="flex-1" onClick={onAccept}>
            {acceptLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function VideoIcon() {
  return (
    <svg
      aria-hidden
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-fg/80"
    >
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
    </svg>
  );
}

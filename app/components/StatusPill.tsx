import type { ReactNode } from "react";
import Button from "./Button";
import CountdownRing from "./CountdownRing";

// Persistent status ("Requesting connection…", "Requesting video…"): it stays
// for as long as the state lasts. Toasts are the opposite: they report a
// moment and leave on their own.
export default function StatusPill({
  children,
  onCancel,
  countdownMs,
  leaving = false,
}: {
  children: ReactNode;
  onCancel?: () => void;
  // When the wait has a deadline, show a ring that empties over that time
  // instead of an open-ended spinner. It starts on mount, so mount the pill
  // when the timer starts (and re-key it for a new timer).
  countdownMs?: number;
  // The wait is over: playing its exit like a toast (usePresence).
  leaving?: boolean;
}) {
  return (
    <div
      inert={leaving}
      className={`pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-glass py-1.5 pl-4 text-sm text-fg shadow-panel backdrop-blur-glass ${
        leaving
          ? "animate-toast-out motion-reduce:animate-fade-out"
          : "animate-toast-in motion-reduce:animate-none"
      } ${onCancel ? "pr-1.5" : "pr-4"}`}
    >
      {countdownMs ? (
        <CountdownRing ms={countdownMs} />
      ) : (
        // Spinner: we're waiting on the other person, with no deadline.
        <span
          aria-hidden
          className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted/40 border-t-fg motion-reduce:animate-none"
        />
      )}
      <span>{children}</span>
      {onCancel && (
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

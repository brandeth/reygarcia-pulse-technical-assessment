import type { ReactNode } from "react";
import Button from "./Button";

// Persistent status ("Requesting connection…", "Requesting video…"): it stays
// for as long as the state lasts. Toasts are the opposite: they report a
// moment and leave on their own.
export default function StatusPill({
  children,
  onCancel,
  countdownMs,
}: {
  children: ReactNode;
  onCancel?: () => void;
  // When the wait has a deadline, show a ring that empties over that time
  // instead of an open-ended spinner. It starts on mount, so mount the pill
  // when the timer starts (and re-key it for a new timer).
  countdownMs?: number;
}) {
  return (
    <div
      className={`pointer-events-auto flex animate-toast-in items-center gap-3 rounded-full border border-line bg-glass py-1.5 pl-4 text-sm text-fg shadow-panel backdrop-blur-glass motion-reduce:animate-none ${
        onCancel ? "pr-1.5" : "pr-4"
      }`}
    >
      {countdownMs ? (
        <svg aria-hidden viewBox="0 0 20 20" className="size-4 shrink-0 -rotate-90">
          <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" className="stroke-muted/30" />
          {/* pathLength=100 makes the dash maths independent of the radius;
              the animation runs the offset 0 → 100, emptying the ring. */}
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            className="animate-countdown stroke-fg motion-reduce:animate-none"
            style={{ animationDuration: `${countdownMs}ms` }}
          />
        </svg>
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

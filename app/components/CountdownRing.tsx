// A ring that empties over `ms`, starting when it mounts. Pure CSS (no
// per-second re-renders), so mount it when the timer starts and re-key it
// for a new timer.
export default function CountdownRing({
  ms,
  className = "size-4",
}: {
  ms: number;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={`shrink-0 -rotate-90 ${className}`}>
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
        // Kept under reduced motion: it's a slow, in-place progress
        // indicator (how long is left), not movement. Stopping it showed a
        // full ring right up until "No answer."
        className="animate-countdown stroke-fg"
        style={{ animationDuration: `${ms}ms` }}
      />
    </svg>
  );
}

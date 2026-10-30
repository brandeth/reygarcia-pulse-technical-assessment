import Button from "./Button";

// Shown when the server rejects our session token (e.g. SESSION_SECRET was
// rotated). Polling has stopped and nothing on the map works any more, so
// this blocks the screen with one way out instead of a passing toast.
export default function SessionExpired() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="expired-title"
      aria-describedby="expired-text"
      className="absolute inset-0 z-50 flex items-center justify-center bg-ink/70 p-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-xs animate-toast-in rounded-panel border border-line bg-surface p-6 text-center shadow-panel motion-reduce:animate-none">
        <h2 id="expired-title" className="font-display text-lg font-semibold">
          Session ended
        </h2>
        <p id="expired-text" className="mt-1 text-sm text-muted">
          Pulse lost track of your session. Reload to drop back onto the map.
        </p>
        <Button
          size="lg"
          className="mt-5 w-full"
          autoFocus
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </div>
    </div>
  );
}

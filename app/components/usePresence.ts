import { useEffect, useState } from "react";

export const EXIT_MS = 200; // matches --animate-card-out / --animate-toast-out

// Keeps something on screen for EXIT_MS after `show` turns false, so it can
// play an exit animation instead of vanishing in one frame. `mounted` says
// whether to render it; `leaving` says it's on its way out.
export function usePresence(show: boolean) {
  const [prevShow, setPrevShow] = useState(show);
  const [leaving, setLeaving] = useState(false);
  // React's pattern for state that follows a prop change: adjust it during
  // render instead of in an effect, so there's no frame where it's missing.
  if (show !== prevShow) {
    setPrevShow(show);
    setLeaving(!show);
  }

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return { mounted: show || leaving, leaving: !show && leaving };
}

export const YOUTUBE_API_TIMEOUT_MS = 15_000;

let activeAttempt: Promise<void> | null = null;

export function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (activeAttempt) return activeAttempt;

  let resolveAttempt!: () => void;
  let rejectAttempt!: (reason: Error) => void;
  const attempt = new Promise<void>((resolve, reject) => {
    resolveAttempt = resolve;
    rejectAttempt = reject;
  });
  activeAttempt = attempt;

  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  const previousCallback = window.onYouTubeIframeAPIReady;
  let settled = false;
  let timeoutId: number;

  const cleanup = (removeScript: boolean) => {
    window.clearTimeout(timeoutId);
    script.removeEventListener('error', handleFailure);
    if (window.onYouTubeIframeAPIReady === handleReady) {
      window.onYouTubeIframeAPIReady = previousCallback;
    }
    if (removeScript) script.remove();
    if (activeAttempt === attempt) activeAttempt = null;
  };

  const handleFailure = () => {
    if (settled) return;
    settled = true;
    if (window.YT?.Player) {
      cleanup(false);
      resolveAttempt();
      return;
    }
    cleanup(true);
    rejectAttempt(new Error('YouTube IFrame API failed to load.'));
  };

  const handleReady = () => {
    if (settled) return;
    try {
      previousCallback?.();
    } finally {
      if (window.YT?.Player) {
        settled = true;
        cleanup(false);
        resolveAttempt();
      } else {
        handleFailure();
      }
    }
  };

  window.onYouTubeIframeAPIReady = handleReady;
  script.addEventListener('error', handleFailure, { once: true });
  timeoutId = window.setTimeout(handleFailure, YOUTUBE_API_TIMEOUT_MS);
  document.head.appendChild(script);

  return attempt;
}

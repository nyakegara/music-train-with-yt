const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'youtu.be']);
const BPM_FINDER_HOSTS = new Set(['youtubetoolkit.com', 'www.youtubetoolkit.com']);
const BPM_FINDER_PATH = '/tools/bpm-finder';
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function youtubeWatchUrl(videoId: string): string | null {
  return VIDEO_ID_PATTERN.test(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (YOUTUBE_HOSTS.has(url.hostname)) return true;
    return BPM_FINDER_HOSTS.has(url.hostname)
      && url.port === ''
      && url.pathname === BPM_FINDER_PATH
      && url.search === ''
      && url.hash === '';
  } catch {
    return false;
  }
}

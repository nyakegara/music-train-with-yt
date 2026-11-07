export function parseYouTubeId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id: string | null = null;

    if (host === 'youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (/^\/(shorts|embed|live)\//.test(url.pathname)) id = url.pathname.split('/')[2] ?? null;
    }

    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function eligibilityServiceMissing(isDevelopment: boolean, endpoint: string | undefined): boolean {
  if (isDevelopment) return false;
  if (!endpoint?.trim()) return true;
  try {
    const url = new URL(endpoint);
    return url.protocol !== 'https:' || Boolean(url.username || url.password || url.search || url.hash);
  } catch {
    return true;
  }
}

export type PracticeSettings = {
  bpm: number;
  firstBeat: number;
  speed: number;
  loopA: number | null;
  loopB: number | null;
  metronomeEnabled: boolean;
  volume: number;
};

export const DEFAULT_SETTINGS: PracticeSettings = {
  bpm: 100,
  firstBeat: 0,
  speed: 1,
  loopA: null,
  loopB: null,
  metronomeEnabled: false,
  volume: 0.35,
};

const storageKey = (videoId: string) => `practice:${videoId}`;
const knownPlaybackRates = new Set([0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function optionalTime(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function sanitizeSettings(value: unknown): PracticeSettings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };

  let loopA = optionalTime(value.loopA);
  let loopB = optionalTime(value.loopB);
  if (loopA !== null && loopB !== null && loopA >= loopB) {
    loopA = null;
    loopB = null;
  }

  return {
    bpm: Math.round(boundedNumber(value.bpm, DEFAULT_SETTINGS.bpm, 40, 240)),
    firstBeat: boundedNumber(value.firstBeat, DEFAULT_SETTINGS.firstBeat, 0, Number.MAX_SAFE_INTEGER),
    speed: typeof value.speed === 'number' && knownPlaybackRates.has(value.speed) ? value.speed : DEFAULT_SETTINGS.speed,
    loopA,
    loopB,
    metronomeEnabled: typeof value.metronomeEnabled === 'boolean' ? value.metronomeEnabled : DEFAULT_SETTINGS.metronomeEnabled,
    volume: boundedNumber(value.volume, DEFAULT_SETTINGS.volume, 0, 1),
  };
}

export function loadSettings(videoId: string): PracticeSettings {
  try {
    const value = localStorage.getItem(storageKey(videoId));
    return value ? { ...sanitizeSettings(JSON.parse(value)), metronomeEnabled: false } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(videoId: string, settings: PracticeSettings): boolean {
  try {
    localStorage.setItem(storageKey(videoId), JSON.stringify({ ...sanitizeSettings(settings), metronomeEnabled: false }));
    return true;
  } catch {
    return false;
  }
}

export function shouldLoop(position: number, duration: number, a: number | null, b: number | null): boolean {
  return a !== null && b !== null && a >= 0 && a < b && b <= duration && position >= b;
}

export function loopStartAt(position: number, duration: number, end: number | null): number | null {
  if (duration <= 0) return null;
  const maximum = end === null ? duration - 0.1 : end - 0.1;
  if (maximum < 0) return null;
  return Math.min(Math.max(0, position), maximum);
}

export function loopEndAt(position: number, duration: number, start: number | null): number | null {
  if (duration <= 0) return null;
  const minimum = start === null ? 0 : start + 0.1;
  if (minimum > duration) return null;
  return Math.min(duration, Math.max(minimum, position));
}

export function nextBeatTime(time: number, firstBeat: number, bpm: number): number {
  const interval = 60 / bpm;
  return firstBeat + Math.ceil((time - firstBeat - 0.02) / interval) * interval;
}

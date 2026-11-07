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

function russianCount(value: number, forms: [string, string, string]): string {
  const lastTwo = value % 100;
  const last = value % 10;
  const form = lastTwo >= 11 && lastTwo <= 14 ? forms[2] : last === 1 ? forms[0] : last >= 2 && last <= 4 ? forms[1] : forms[2];
  return `${value} ${form}`;
}

function formatRetryDelay(retryAfter: string | null): string | null {
  if (!retryAfter || !/^\d+$/.test(retryAfter)) return null;
  const seconds = Number(retryAfter);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 3600) return null;
  if (seconds < 60) return russianCount(seconds, ['секунду', 'секунды', 'секунд']);

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0
    ? russianCount(minutes, ['минуту', 'минуты', 'минут'])
    : `${russianCount(minutes, ['минуту', 'минуты', 'минут'])} ${russianCount(remainingSeconds, ['секунду', 'секунды', 'секунд'])}`;
}

export function eligibilityErrorMessage(errorCode: string | undefined, retryAfter: string | null, retryable?: boolean): string {
  const delay = retryable === false ? null : formatRetryDelay(retryAfter);
  const retryGuidance = delay ? ` Попробуй снова через ${delay}.` : ' Попробуй позже.';

  switch (errorCode) {
    case 'rate_limited':
      return `Слишком много проверок за короткое время.${retryGuidance}`;
    case 'upstream_rate_limited':
      return `YouTube временно ограничил проверку видео.${retryGuidance}`;
    case 'upstream_unavailable':
      return `Сервис проверки видео временно недоступен.${retryGuidance}`;
    case 'service_unavailable':
      return retryable
        ? `Сервис проверки временно ограничил запросы.${retryGuidance}`
        : 'Сервис проверки не настроен. Попробуй позже.';
    case 'quota_exceeded':
      return 'Квота YouTube для проверки видео исчерпана. Попробуй позже.';
    case 'youtube_api_forbidden':
      return 'Сервису проверки запрещён доступ к YouTube. Требуется исправить настройки сервиса.';
    case 'upstream_rejected':
      return 'Проверка не смогла подтвердить доступность видео. Открой видео на YouTube.';
    default:
      return 'Не удалось проверить видео. Попробуй позже.';
  }
}

export function youtubePlayerOrigin(isDevelopment: boolean, localOrigin: string): string {
  return isDevelopment ? localOrigin : 'https://com.musictrain.desktop';
}

export type PracticeSettings = {
  bpm: number;
  timeSignature: 3 | 4;
  firstBeat: number;
  speed: number;
  loopA: number | null;
  loopB: number | null;
  metronomeEnabled: boolean;
  volume: number;
};

export const DEFAULT_SETTINGS: PracticeSettings = {
  bpm: 100,
  timeSignature: 4,
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
    timeSignature: value.timeSignature === 3 ? 3 : 4,
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

export function clampPosition(position: number, duration: number): number {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration, Math.max(0, position));
}

export function nextBeatTime(time: number, firstBeat: number, bpm: number): number {
  if (time < firstBeat - 0.02) return firstBeat;
  const interval = 60 / bpm;
  return firstBeat + Math.ceil((time - firstBeat - 0.02) / interval) * interval;
}

export function isDownbeat(beatIndex: number, beatsPerBar: 3 | 4): boolean {
  return Number.isInteger(beatIndex) && beatIndex >= 0 && beatIndex % beatsPerBar === 0;
}

export function nextBeatSchedule(time: number, firstBeat: number, bpm: number, speed: number): { beatTime: number; beatIndex: number; audioDelay: number } {
  const beatTime = nextBeatTime(time, firstBeat, bpm);
  const beatInterval = 60 / bpm;
  const playbackRate = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return {
    beatTime,
    beatIndex: Math.round((beatTime - firstBeat) / beatInterval),
    audioDelay: Math.max(0, beatTime - time) / playbackRate,
  };
}

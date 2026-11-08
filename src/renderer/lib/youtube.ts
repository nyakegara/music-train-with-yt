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

export function youtubePlayerErrorMessage(code: number | undefined): string {
  switch (code) {
    case 2: return 'YouTube отклонил ссылку на видео. Проверь адрес и попробуй снова.';
    case 5: return 'Плеер YouTube не смог запустить это видео. Попробуй обновить его или открыть на YouTube.';
    case 100: return 'Видео удалено, скрыто или недоступно. Открой YouTube, чтобы проверить доступ.';
    case 101:
    case 150: return 'Автор видео запретил воспроизведение на других сайтах. Открой его на YouTube.';
    case 153: return 'YouTube не подтвердил источник видео. Обнови приложение и попробуй снова.';
    default: return 'Это видео нельзя воспроизвести здесь. Проверь доступность или открой его на YouTube.';
  }
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

export type PracticeSegment = {
  id: string;
  label: string;
  loopA: number;
  loopB: number;
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
const practiceSegmentsStorageKey = (videoId: string) => `practice-segments:${videoId}`;
const lastVideoIdStorageKey = 'lastVideoId';
const validYouTubeId = /^[A-Za-z0-9_-]{11}$/;
const validPracticeSegmentId = /^[A-Za-z0-9_-]{1,80}$/;
const maximumPracticeSegmentLabelLength = 40;
const knownPlaybackRates = new Set([0.25, 0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]);

export function loadLastVideoId(): string | null {
  try {
    const videoId = localStorage.getItem(lastVideoIdStorageKey);
    return videoId && validYouTubeId.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export function saveLastVideoId(videoId: string): boolean {
  if (!validYouTubeId.test(videoId)) return false;
  try {
    localStorage.setItem(lastVideoIdStorageKey, videoId);
    return true;
  } catch {
    return false;
  }
}

export function clearLastVideoId(): boolean {
  try {
    localStorage.removeItem(lastVideoIdStorageKey);
    return true;
  } catch {
    return false;
  }
}

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

function normalizePracticeSegment(value: unknown): PracticeSegment | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || !validPracticeSegmentId.test(value.id)) return null;
  if (typeof value.label !== 'string') return null;
  const label = value.label.trim();
  if (!label || label.length > maximumPracticeSegmentLabelLength) return null;
  if (typeof value.loopA !== 'number' || !Number.isFinite(value.loopA) || value.loopA < 0) return null;
  if (typeof value.loopB !== 'number' || !Number.isFinite(value.loopB) || value.loopB <= value.loopA) return null;
  return { id: value.id, label, loopA: value.loopA, loopB: value.loopB };
}

function validUniquePracticeSegments(value: unknown): PracticeSegment[] | null {
  if (!Array.isArray(value)) return null;
  const segments: PracticeSegment[] = [];
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const item of value) {
    const segment = normalizePracticeSegment(item);
    if (!segment) return null;
    const normalizedLabel = segment.label.toLocaleLowerCase('ru-RU');
    if (ids.has(segment.id) || labels.has(normalizedLabel)) return null;
    ids.add(segment.id);
    labels.add(normalizedLabel);
    segments.push(segment);
  }
  return segments;
}

export function loadPracticeSegments(videoId: string): PracticeSegment[] {
  if (!validYouTubeId.test(videoId)) return [];
  try {
    const stored = localStorage.getItem(practiceSegmentsStorageKey(videoId));
    if (!stored) return [];
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    const segments: PracticeSegment[] = [];
    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const item of value) {
      const segment = normalizePracticeSegment(item);
      if (!segment) continue;
      const normalizedLabel = segment.label.toLocaleLowerCase('ru-RU');
      if (ids.has(segment.id) || labels.has(normalizedLabel)) continue;
      ids.add(segment.id);
      labels.add(normalizedLabel);
      segments.push(segment);
    }
    return segments;
  } catch {
    return [];
  }
}

export function savePracticeSegments(videoId: string, segments: PracticeSegment[]): boolean {
  if (!validYouTubeId.test(videoId)) return false;
  const normalized = validUniquePracticeSegments(segments);
  if (!normalized) return false;
  try {
    localStorage.setItem(practiceSegmentsStorageKey(videoId), JSON.stringify(normalized));
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

export function adjustFirstBeat(firstBeat: number, delta: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(delta)) return Number.isFinite(firstBeat) ? Math.max(0, firstBeat) : 0;
  const maximum = Math.floor(duration * 1000) / 1000;
  const current = Number.isFinite(firstBeat) ? firstBeat : 0;
  const adjusted = Math.round((current + delta) * 1000) / 1000;
  return Math.min(maximum, Math.max(0, adjusted));
}

export function videoTimeAtPointer(clientX: number, trackLeft: number, trackWidth: number, duration: number): number | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(trackLeft) || !Number.isFinite(trackWidth) || !Number.isFinite(duration) || trackWidth <= 0 || duration <= 0) return null;
  return clampPosition(((clientX - trackLeft) / trackWidth) * duration, duration);
}

const BEAT_TOLERANCE_SECONDS = 0.02;

export function beatIndexAt(time: number, firstBeat: number, bpm: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(firstBeat) || !Number.isFinite(bpm) || bpm <= 0) return -1;
  if (time < firstBeat) return -1;
  return Math.max(0, Math.floor((time - firstBeat + BEAT_TOLERANCE_SECONDS) / (60 / bpm)));
}

export function nextBeatTime(time: number, firstBeat: number, bpm: number): number {
  if (time < firstBeat - BEAT_TOLERANCE_SECONDS) return firstBeat;
  const interval = 60 / bpm;
  return firstBeat + Math.ceil((time - firstBeat - BEAT_TOLERANCE_SECONDS) / interval) * interval;
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

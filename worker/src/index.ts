export interface Env { YOUTUBE_API_KEY: string; RATE_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> } }

const maxRetryAfterSeconds = 3600;
const defaultRetryAfterSeconds = 30;
const localRetryAfterSeconds = 60;
const httpDatePattern = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

const json = (body: unknown, status = 200, extraHeaders?: HeadersInit) => {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-expose-headers': 'Retry-After',
    'cache-control': 'no-store',
  });
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(body), { status, headers });
};

const serviceError = (error: string, retryable: boolean, status: number, retryAfter?: number) =>
  json({ error, retryable }, status, retryAfter === undefined ? undefined : { 'Retry-After': String(retryAfter) });

const retryAfterSeconds = (value: string | null, now = Date.now()) => {
  if (value === null || value.trim() === '') return defaultRetryAfterSeconds;
  const trimmed = value.trim();
  let seconds: number;
  if (/^\d+$/.test(trimmed)) seconds = Number(trimmed);
  else {
    if (!httpDatePattern.test(trimmed)) return defaultRetryAfterSeconds;
    const date = Date.parse(trimmed);
    if (!Number.isFinite(date) || new Date(date).toUTCString() !== trimmed) return defaultRetryAfterSeconds;
    seconds = Math.ceil((date - now) / 1000);
  }
  if (!Number.isFinite(seconds)) return defaultRetryAfterSeconds;
  return Math.min(maxRetryAfterSeconds, Math.max(1, seconds));
};

const validId = (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id);
const quotaReasons = new Set(['quotaExceeded', 'dailyLimitExceeded']);
const rateLimitReasons = new Set(['userRateLimitExceeded', 'rateLimitExceeded', 'servingLimitExceeded']);
const apiKeyReasons = new Set(['keyInvalid', 'keyExpired']);

async function upstreamFailure(response: Response): Promise<Response> {
  if (response.status === 400 || response.status === 403) {
    try {
      const data = await response.json() as { error?: { errors?: Array<{ reason?: string }> } };
      const reasons = data.error?.errors?.map((error) => error.reason) ?? [];
      if (reasons.some((reason) => reason && rateLimitReasons.has(reason))) return serviceError('upstream_rate_limited', true, 503, retryAfterSeconds(response.headers.get('Retry-After')));
      if (response.status === 400 && reasons.some((reason) => reason && apiKeyReasons.has(reason))) return serviceError('youtube_api_forbidden', false, 503);
      if (response.status === 403 && reasons.some((reason) => reason && quotaReasons.has(reason))) return serviceError('quota_exceeded', false, 503);
    } catch { /* The upstream error body is optional; keep the generic diagnosis. */ }
    if (response.status === 403) return serviceError('youtube_api_forbidden', false, 503);
  }
  if (response.status === 429) return serviceError('upstream_rate_limited', true, 503, retryAfterSeconds(response.headers.get('Retry-After')));
  if (response.status >= 500) return serviceError('upstream_unavailable', true, 503, retryAfterSeconds(response.headers.get('Retry-After')));
  return serviceError('upstream_rejected', false, 502);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-expose-headers': 'Retry-After' } });
    if (request.method !== 'GET') return serviceError('method_not_allowed', false, 405);
    const match = url.pathname.match(/^\/v1\/videos\/([^/]+)\/eligibility$/);
    if (!match) return serviceError('not_found', false, 404);
    const videoId = match[1];
    if (!validId(videoId)) return serviceError('invalid_video_id', false, 400);
    if (!env.YOUTUBE_API_KEY) return serviceError('service_unavailable', false, 503);
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    let rate: { success: boolean };
    try { rate = await env.RATE_LIMITER.limit({ key: ip }); }
    catch { return serviceError('service_unavailable', true, 503, defaultRetryAfterSeconds); }
    if (!rate.success) return serviceError('rate_limited', true, 429, localRetryAfterSeconds);

    try {
      const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      apiUrl.search = new URLSearchParams({ part: 'id,status', id: videoId }).toString();
      const response = await fetch(apiUrl, { headers: { accept: 'application/json', 'x-goog-api-key': env.YOUTUBE_API_KEY }, signal: AbortSignal.timeout(6000) });
      if (!response.ok) return upstreamFailure(response);
      const data = await response.json() as { items?: unknown };
      if (!Array.isArray(data.items)) return serviceError('upstream_unavailable', true, 503, defaultRetryAfterSeconds);
      const rawItem = data.items[0];
      if (rawItem === undefined) return json({ eligible: false, reason: 'unavailable' });
      if (rawItem === null || typeof rawItem !== 'object') return serviceError('upstream_unavailable', true, 503, defaultRetryAfterSeconds);
      const item = rawItem as { status?: unknown };
      if (item.status === null || typeof item.status !== 'object') return serviceError('upstream_unavailable', true, 503, defaultRetryAfterSeconds);
      const status = item.status as { embeddable?: boolean; privacyStatus?: string; madeForKids?: boolean };
      if (typeof status.privacyStatus !== 'string') return serviceError('upstream_unavailable', true, 503, defaultRetryAfterSeconds);
      if (status.madeForKids) return json({ eligible: false, reason: 'made_for_kids' });
      if (status.privacyStatus !== 'public') return json({ eligible: false, reason: 'not_public' });
      if (status.embeddable !== true) return json({ eligible: false, reason: 'embedding_disabled' });
      return json({ eligible: true });
    } catch {
      return serviceError('upstream_unavailable', true, 503, defaultRetryAfterSeconds);
    }
  },
};

export { validId };

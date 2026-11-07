export interface Env { YOUTUBE_API_KEY: string }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' },
});

const validId = (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'content-type' } });
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    const match = url.pathname.match(/^\/v1\/videos\/([^/]+)\/eligibility$/);
    if (!match) return json({ error: 'not_found' }, 404);
    const videoId = match[1];
    if (!validId(videoId)) return json({ error: 'invalid_video_id' }, 400);
    if (!env.YOUTUBE_API_KEY) return json({ error: 'service_unavailable' }, 503);

    try {
      const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      apiUrl.search = new URLSearchParams({ part: 'status', id: videoId, key: env.YOUTUBE_API_KEY }).toString();
      const response = await fetch(apiUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
      if (response.status === 404 || !response.ok) return json({ error: response.status === 403 ? 'quota_exceeded' : 'youtube_unavailable' }, response.status === 403 ? 503 : 502);
      const data = await response.json() as { items?: Array<{ status?: { embeddable?: boolean; privacyStatus?: string; madeForKids?: boolean } }> };
      const item = data.items?.[0];
      if (!item) return json({ eligible: false, reason: 'unavailable' });
      const status = item.status ?? {};
      if (status.madeForKids) return json({ eligible: false, reason: 'made_for_kids' });
      if (status.privacyStatus !== 'public') return json({ eligible: false, reason: 'not_public' });
      if (status.embeddable === false) return json({ eligible: false, reason: 'embedding_disabled' });
      return json({ eligible: true });
    } catch {
      return json({ error: 'youtube_unavailable' }, 502);
    }
  },
};

export { validId };

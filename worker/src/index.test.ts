import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const env = { YOUTUBE_API_KEY: 'key', RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) } };

describe('eligibility endpoint', () => {
  it('rejects invalid ids before making an upstream request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/no/eligibility'), env);
    expect(response.status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('denies videos marked for children', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ status: { privacyStatus: 'public', embeddable: true, madeForKids: true } }] }))));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(await response.json()).toEqual({ eligible: false, reason: 'made_for_kids' });
  });
  it('allows an embeddable public video', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ status: { privacyStatus: 'public', embeddable: true, madeForKids: false } }] })));
    vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(await response.json()).toEqual({ eligible: true });
    const [requestUrl, init] = fetchMock.mock.calls[0];
    expect(String(requestUrl)).not.toContain('key=');
    expect(new URL(String(requestUrl)).searchParams.get('part')).toBe('id,status');
    expect(new URL(String(requestUrl)).searchParams.get('id')).toBe('dQw4w9WgXcQ');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('key');
  });
  it('denies videos with embedding disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ status: { privacyStatus: 'public', embeddable: false } }] }))));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(await response.json()).toEqual({ eligible: false, reason: 'embedding_disabled' });
  });
  it('fails closed when the upstream response does not confirm embedding support', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ status: { privacyStatus: 'public' } }] }))));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(await response.json()).toEqual({ eligible: false, reason: 'embedding_disabled' });
  });
  it('reports a missing video as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }))));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(await response.json()).toEqual({ eligible: false, reason: 'unavailable' });
  });
  it('fails closed when the YouTube API key is missing', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const noKeyEnv = { ...env, YOUTUBE_API_KEY: '' };
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), noKeyEnv);
    expect(response.status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
    expect(noKeyEnv.RATE_LIMITER.limit).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ error: 'service_unavailable', retryable: false });
  });
  it('does not misreport an invalid API key as exhausted quota', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { errors: [{ reason: 'keyInvalid' }] } }), { status: 403 })));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'youtube_api_forbidden', retryable: false });
  });
  it.each([['userRateLimitExceeded', 403], ['rateLimitExceeded', 403], ['rateLimitExceeded', 400], ['servingLimitExceeded', 403]])('treats YouTube %s from HTTP %i as a temporary rate limit', async (reason, status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { errors: [{ reason }] } }), { status })));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'upstream_rate_limited', retryable: true });
    expect(response.headers.get('Retry-After')).toBe('30');
  });
  it('reports quota exhaustion only for a recognized quota error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 })));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'quota_exceeded', retryable: false });
  });
  it('normalizes upstream 429 into a retryable 503 and preserves the retry delay', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream secret detail', { status: 429, headers: { 'Retry-After': '90' } })));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: 'upstream_rate_limited', retryable: true });
    expect(response.headers.get('Retry-After')).toBe('90');
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
    expect(body).not.toContain('upstream secret detail');
  });
  it('normalizes an upstream 5xx response and clamps an oversized retry delay', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream failure detail', { status: 503, headers: { 'Retry-After': '999999' } })));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: 'upstream_unavailable', retryable: true });
    expect(response.headers.get('Retry-After')).toBe('3600');
    expect(body).not.toContain('upstream failure detail');
  });
  it.each([['absent', undefined, '30'], ['invalid', 'later', '30'], ['zero', '0', '1']])('normalizes %s upstream Retry-After', async (_label, retryAfter, expectedDelay) => {
    const headers = new Headers();
    if (retryAfter !== undefined) headers.set('Retry-After', retryAfter);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream unavailable', { status: 502, headers })));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(response.headers.get('Retry-After')).toBe(expectedDelay);
    expect(await response.json()).toEqual({ error: 'upstream_unavailable', retryable: true });
  });
  it('parses upstream HTTP-date Retry-After into bounded delta seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503, headers: { 'Retry-After': 'Sat, 07 Nov 2026 12:01:30 GMT' } })));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(response.headers.get('Retry-After')).toBe('90');
    expect(await response.json()).toEqual({ error: 'upstream_unavailable', retryable: true });
    vi.useRealTimers();
  });
  it('treats an unexpected upstream 4xx rejection as non-retryable and sanitized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream detail', { status: 400 })));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: 'upstream_rejected', retryable: false });
    expect(response.headers.get('Retry-After')).toBeNull();
    expect(body).not.toContain('private upstream detail');
  });
  it('returns retry guidance when the upstream request fails or returns malformed JSON', async () => {
    const request = new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
    const timeoutResponse = await worker.fetch(request, env);
    expect(timeoutResponse.status).toBe(503);
    expect(await timeoutResponse.json()).toEqual({ error: 'upstream_unavailable', retryable: true });
    expect(timeoutResponse.headers.get('Retry-After')).toBe('30');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json')));
    const malformedResponse = await worker.fetch(request, env);
    expect(malformedResponse.status).toBe(503);
    expect(await malformedResponse.json()).toEqual({ error: 'upstream_unavailable', retryable: true });
  });
  it('advertises Retry-After to cross-origin clients on preflight', async () => {
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility', { method: 'OPTIONS' }), env);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Retry-After');
  });
  it('returns a retryable service error when the Cloudflare limiter fails', async () => {
    const rateEnv = { ...env, RATE_LIMITER: { limit: vi.fn().mockRejectedValue(new Error('limiter unavailable')) } };
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), rateEnv);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'service_unavailable', retryable: true });
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns 429 without calling YouTube when the client exceeds the limit', async () => {
    const rateEnv = { ...env, RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) } };
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility', { headers: { 'CF-Connecting-IP': '192.0.2.1' } }), rateEnv);
    expect(response.status).toBe(429); expect(fetchMock).not.toHaveBeenCalled();
    expect(rateEnv.RATE_LIMITER.limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
    expect(await response.json()).toEqual({ error: 'rate_limited', retryable: true });
    expect(response.headers.get('Retry-After')).toBe('60');
  });
});

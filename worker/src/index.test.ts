import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

afterEach(() => vi.unstubAllGlobals());
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ status: { privacyStatus: 'public', embeddable: true, madeForKids: false } }] }))));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), env);
    expect(await response.json()).toEqual({ eligible: true });
  });
  it('returns 429 without calling YouTube when the client exceeds the limit', async () => {
    const rateEnv = { ...env, RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: false }) } };
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility', { headers: { 'CF-Connecting-IP': '192.0.2.1' } }), rateEnv);
    expect(response.status).toBe(429); expect(fetchMock).not.toHaveBeenCalled();
    expect(rateEnv.RATE_LIMITER.limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
  });
});

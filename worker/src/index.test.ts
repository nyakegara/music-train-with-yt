import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index';

afterEach(() => vi.unstubAllGlobals());

describe('eligibility endpoint', () => {
  it('rejects invalid ids before making an upstream request', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/no/eligibility'), { YOUTUBE_API_KEY: 'key' });
    expect(response.status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('denies videos marked for children', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ status: { privacyStatus: 'public', embeddable: true, madeForKids: true } }] }))));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), { YOUTUBE_API_KEY: 'key' });
    expect(await response.json()).toEqual({ eligible: false, reason: 'made_for_kids' });
  });
  it('allows an embeddable public video', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ status: { privacyStatus: 'public', embeddable: true, madeForKids: false } }] }))));
    const response = await worker.fetch(new Request('https://worker.test/v1/videos/dQw4w9WgXcQ/eligibility'), { YOUTUBE_API_KEY: 'key' });
    expect(await response.json()).toEqual({ eligible: true });
  });
});

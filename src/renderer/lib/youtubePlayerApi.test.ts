import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadYouTubeIframeApi, YOUTUBE_API_TIMEOUT_MS } from './youtubePlayerApi';

const apiScripts = () => document.querySelectorAll<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
const latestApiScript = () => apiScripts().item(apiScripts().length - 1);
const publishApiReady = () => {
  (window as any).YT = { Player: class Player {} };
  window.onYouTubeIframeAPIReady?.();
};

describe('YouTube IFrame API loader', () => {
  beforeEach(() => {
    (window as any).YT = undefined;
    window.onYouTubeIframeAPIReady = undefined;
    apiScripts().forEach((script) => script.remove());
  });

  afterEach(() => {
    vi.useRealTimers();
    (window as any).YT = undefined;
    window.onYouTubeIframeAPIReady = undefined;
    apiScripts().forEach((script) => script.remove());
  });

  it('resolves immediately when the YouTube API is already ready', async () => {
    (window as any).YT = { Player: class Player {} };

    await expect(loadYouTubeIframeApi()).resolves.toBeUndefined();

    expect(apiScripts()).toHaveLength(0);
  });

  it('shares one script and promise between concurrent callers', async () => {
    const first = loadYouTubeIframeApi();
    const second = loadYouTubeIframeApi();

    expect(second).toBe(first);
    expect(apiScripts()).toHaveLength(1);
    publishApiReady();
    await expect(first).resolves.toBeUndefined();
  });

  it('removes a failed script and allows a successful retry', async () => {
    const previousCallback = vi.fn();
    window.onYouTubeIframeAPIReady = previousCallback;
    const firstAttempt = loadYouTubeIframeApi();
    const failedScript = latestApiScript();
    failedScript.dispatchEvent(new Event('error'));

    await expect(firstAttempt).rejects.toThrow();
    expect(apiScripts()).toHaveLength(0);
    expect(window.onYouTubeIframeAPIReady).toBe(previousCallback);

    const retry = loadYouTubeIframeApi();
    expect(apiScripts()).toHaveLength(1);
    publishApiReady();
    await expect(retry).resolves.toBeUndefined();
    expect(previousCallback).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled script and succeeds on retry', async () => {
    vi.useFakeTimers();
    const stalledAttempt = loadYouTubeIframeApi();
    const rejection = expect(stalledAttempt).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(YOUTUBE_API_TIMEOUT_MS);
    await rejection;
    expect(apiScripts()).toHaveLength(0);

    const retry = loadYouTubeIframeApi();
    publishApiReady();
    await expect(retry).resolves.toBeUndefined();
  });

  it('settles once for duplicate ready callbacks and restores the previous callback', async () => {
    const previousCallback = vi.fn();
    window.onYouTubeIframeAPIReady = previousCallback;
    const attempt = loadYouTubeIframeApi();
    const ownedCallback = window.onYouTubeIframeAPIReady!;
    (window as any).YT = { Player: class Player {} };

    ownedCallback();
    ownedCallback();

    await expect(attempt).resolves.toBeUndefined();
    expect(previousCallback).toHaveBeenCalledTimes(1);
    expect(window.onYouTubeIframeAPIReady).toBe(previousCallback);
  });

  it('does not overwrite a callback installed by another owner during a failed attempt', async () => {
    const attempt = loadYouTubeIframeApi();
    const otherOwner = vi.fn();
    window.onYouTubeIframeAPIReady = otherOwner;
    latestApiScript().dispatchEvent(new Event('error'));

    await expect(attempt).rejects.toThrow();
    expect(window.onYouTubeIframeAPIReady).toBe(otherOwner);
  });

  it('resolves at timeout if the API became ready while another owner replaced the callback', async () => {
    vi.useFakeTimers();
    const attempt = loadYouTubeIframeApi();
    const otherOwner = vi.fn();
    window.onYouTubeIframeAPIReady = otherOwner;
    (window as any).YT = { Player: class Player {} };

    await vi.advanceTimersByTimeAsync(YOUTUBE_API_TIMEOUT_MS);
    await expect(attempt).resolves.toBeUndefined();
    expect(window.onYouTubeIframeAPIReady).toBe(otherOwner);
  });
});

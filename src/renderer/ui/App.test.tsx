import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { estimateBpmFromFile, LocalAudioAnalysisError } = vi.hoisted(() => {
  class MockLocalAudioAnalysisError extends Error {
    constructor(readonly code: string, message: string) { super(message); }
  }
  return { estimateBpmFromFile: vi.fn(), LocalAudioAnalysisError: MockLocalAudioAnalysisError };
});
vi.mock('../lib/localAudioAnalysis', () => ({ estimateBpmFromFile, LocalAudioAnalysisError }));
import App from './App';
import { YOUTUBE_API_TIMEOUT_MS } from '../lib/youtubePlayerApi';

class MockYouTubePlayer {
  static instances: MockYouTubePlayer[] = [];
  readonly options: any;
  loadVideoById = vi.fn();
  seekTo = vi.fn((time: number) => { this.currentTime = time; });
  setPlaybackRate = vi.fn((rate: number) => { this.currentRate = rate; });
  unMute = vi.fn();
  playVideo = vi.fn(() => { this.playerState = 1; this.options.events.onStateChange({ target: this, data: 1 }); });
  pauseVideo = vi.fn(() => { this.playerState = 2; this.options.events.onStateChange({ target: this, data: 2 }); });
  currentTime = 0;
  currentRate = 1;
  playerState = 2;

  constructor(_target: HTMLElement, options: any) {
    this.options = options;
    MockYouTubePlayer.instances.push(this);
  }

  destroy() {}
  getDuration() { return 180; }
  getAvailablePlaybackRates() { return [0.5, 0.75, 1, 1.25]; }
  getPlaybackRate() { return this.currentRate; }
  getCurrentTime() { return this.currentTime; }
  getPlayerState() { return this.playerState; }
  isMuted() { return false; }
}

async function mountPracticeVideo(firstBeat = 0) {
  localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 100, firstBeat, speed: 0.5, loopA: 10, loopB: 20, metronomeEnabled: false, volume: 0.35 }));
  render(<App />);
  await act(async () => { window.onYouTubeIframeAPIReady?.(); });
  fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
  const player = MockYouTubePlayer.instances[0];
  act(() => player.options.events.onReady({ target: player }));
  return player;
}

class MockOscillator {
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockGain {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  static instance: MockAudioContext;
  currentTime = 0;
  state = 'running';
  destination = {};
  oscillators: MockOscillator[] = [];
  resume = vi.fn();
  constructor() { MockAudioContext.instance = this; }
  createOscillator() { const oscillator = new MockOscillator(); this.oscillators.push(oscillator); return oscillator as unknown as OscillatorNode; }
  createGain() { return new MockGain() as unknown as GainNode; }
}

describe('YouTube player lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    MockYouTubePlayer.instances = [];
    estimateBpmFromFile.mockReset();
    window.onYouTubeIframeAPIReady = undefined;
    document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach((script) => script.remove());
    vi.stubGlobal('AudioContext', MockAudioContext);
    window.YT = { Player: MockYouTubePlayer };
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('offers the fixed BPM Finder handoff after a video is loaded without sharing its ID', async () => {
    await mountPracticeVideo();
    const link = screen.getByRole('link', { name: 'Открыть BPM Finder' }) as HTMLAnchorElement;
    expect(link.href).toBe('https://youtubetoolkit.com/tools/bpm-finder');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noreferrer');
    expect(link.href).not.toContain('dQw4w9WgXcQ');
    expect(screen.getByText(/сервис ищет BPM в метаданных видео/)).toBeTruthy();
    expect(screen.getByText(/внеси его вручную/)).toBeTruthy();
  });

  it('shows the remembered video after remount without fetching or starting playback', async () => {
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ eligible: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const first = render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    await waitFor(() => expect(localStorage.getItem('lastVideoId')).toBe('dQw4w9WgXcQ'));
    expect(screen.getByRole('button', { name: /dQw4w9WgXcQ/ })).toBeTruthy();
    first.unmount();
    MockYouTubePlayer.instances = [];
    fetchMock.mockClear();
    render(<App />);
    expect(screen.getByRole('button', { name: /dQw4w9WgXcQ/ })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(MockYouTubePlayer.instances).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Играть' }).hasAttribute('disabled')).toBe(true);
  });

  it('rechecks a remembered video and restores its settings without autoplay', async () => {
    localStorage.setItem('lastVideoId', 'dQw4w9WgXcQ');
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 92, speed: 0.75, loopA: 12, loopB: 28, volume: 0.6 }));
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ eligible: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.click(screen.getByRole('button', { name: /dQw4w9WgXcQ/ }));
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledWith('https://eligibility.example/v1/videos/dQw4w9WgXcQ/eligibility');
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    expect(player.setPlaybackRate).toHaveBeenCalledWith(0.75);
    expect((screen.getByRole('textbox', { name: 'Темп BPM' }) as HTMLInputElement).value).toBe('92');
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it('keeps the remembered video when replacement is rejected', async () => {
    localStorage.setItem('lastVideoId', 'dQw4w9WgXcQ');
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ eligible: false, reason: 'not_embeddable' }) }));
    render(<App />);
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/oHg5SJYRHA0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    await screen.findByRole('alert');
    expect(localStorage.getItem('lastVideoId')).toBe('dQw4w9WgXcQ');
    expect(screen.getByRole('button', { name: /dQw4w9WgXcQ/ })).toBeTruthy();
    expect(MockYouTubePlayer.instances).toHaveLength(0);
  });

  it('plays the same ready remembered video without another eligibility check', async () => {
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ eligible: true }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(1));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.click(screen.getByRole('button', { name: /dQw4w9WgXcQ/ }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    expect(MockYouTubePlayer.instances).toHaveLength(1);
  });

  it('clears only the remembered pointer and leaves saved video settings', () => {
    localStorage.setItem('lastVideoId', 'dQw4w9WgXcQ');
    const settings = JSON.stringify({ bpm: 92, speed: 0.75, loopA: 12, loopB: 28, volume: 0.6 });
    localStorage.setItem('practice:dQw4w9WgXcQ', settings);
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Очистить последнее видео' }));
    expect(localStorage.getItem('lastVideoId')).toBeNull();
    expect(localStorage.getItem('practice:dQw4w9WgXcQ')).toBe(settings);
    expect(screen.getByText('Последнее видео появится здесь')).toBeTruthy();
  });

  it('keeps the remembered card and playback available when clearing storage fails', async () => {
    localStorage.setItem('lastVideoId', 'dQw4w9WgXcQ');
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Очистить последнее видео' }));
      expect(localStorage.getItem('lastVideoId')).toBe('dQw4w9WgXcQ');
      expect(screen.getByRole('button', { name: /dQw4w9WgXcQ/ })).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toContain('Не удалось убрать последнее видео');
      fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
      expect(player.playVideo).toHaveBeenCalledTimes(1);
    } finally {
      removeItem.mockRestore();
    }
  });

  it('shows a retry delay, keeps the pasted link, and retries only after another click', async () => {
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: { get: (name: string) => name.toLowerCase() === 'retry-after' ? '45' : null },
      json: vi.fn().mockResolvedValue({ error: 'service_unavailable', retryable: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    const input = screen.getByLabelText('ССЫЛКА НА ВИДЕО') as HTMLInputElement;
    fireEvent.change(input, { target: { value: url } });
    const loadButton = screen.getByRole('button', { name: 'Загрузить видео' });

    fireEvent.click(loadButton);
    expect(fetchMock).toHaveBeenCalledWith('https://eligibility.example/v1/videos/dQw4w9WgXcQ/eligibility');
    expect((await screen.findByRole('alert')).textContent).toContain('45 секунд');
    expect(screen.queryByText('Сначала загрузи видео, чтобы управлять воспроизведением.')).toBeNull();
    expect(input.value).toBe(url);
    expect(MockYouTubePlayer.instances).toHaveLength(0);

    fireEvent.click(loadButton);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(input.value).toBe(url);
  });

  it('shows a checking status instead of the unloaded-player hint while the service responds', async () => {
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    let resolveFetch!: (value: any) => void;
    const pendingResponse = new Promise<any>((resolve) => { resolveFetch = resolve; });
    const fetchMock = vi.fn().mockReturnValue(pendingResponse);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Проверяю доступность видео…')).toBeTruthy();
    expect(screen.queryByText('Сначала загрузи видео, чтобы управлять воспроизведением.')).toBeNull();

    resolveFetch({
      ok: false,
      headers: { get: () => '30' },
      json: vi.fn().mockResolvedValue({ error: 'upstream_unavailable', retryable: true }),
    });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('30 секунд'));
    expect(screen.queryByText('Проверяю доступность видео…')).toBeNull();
    expect(screen.queryByText('Сначала загрузи видео, чтобы управлять воспроизведением.')).toBeNull();
  });

  it('shows replacement checks, ignores duplicate submits, and keeps the current player on rejection', async () => {
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    let resolveVideoB!: (response: any) => void;
    let resolveVideoC!: (response: any) => void;
    const pendingVideoB = new Promise<any>((resolve) => { resolveVideoB = resolve; });
    const pendingVideoC = new Promise<any>((resolve) => { resolveVideoC = resolve; });
    const eligibleResponse = { ok: true, json: vi.fn().mockResolvedValue({ eligible: true }) };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(eligibleResponse)
      .mockReturnValueOnce(pendingVideoB)
      .mockReturnValueOnce(pendingVideoC);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    const input = screen.getByLabelText('ССЫЛКА НА ВИДЕО');
    const loadButton = screen.getByRole('button', { name: 'Загрузить видео' });
    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(loadButton);
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(1));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));

    fireEvent.change(input, { target: { value: 'https://youtu.be/oHg5SJYRHA0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Проверяю доступность видео…').closest('[role="status"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Проверяю…' }).hasAttribute('disabled')).toBe(true);
    const playButton = screen.getByRole('button', { name: 'Играть' });
    expect(playButton.hasAttribute('disabled')).toBe(false);
    fireEvent.click(playButton);
    expect(player.playVideo).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: 'https://youtu.be/9bZkp7q19f0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('button', { name: 'Проверяю…' }).hasAttribute('disabled')).toBe(true);
    await act(async () => { resolveVideoB({ ok: true, json: vi.fn().mockResolvedValue({ eligible: true }) }); });
    expect(screen.getByText('Проверяю доступность видео…').closest('[role="status"]')).toBeTruthy();

    await act(async () => { resolveVideoC({ ok: true, json: vi.fn().mockResolvedValue({ eligible: false, reason: 'not_embeddable' }) }); });
    expect(screen.queryByText('Проверяю доступность видео…')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Видео недоступно для встраивания');
    expect(screen.getByText('dQw4w9WgXcQ')).toBeTruthy();
    expect(MockYouTubePlayer.instances).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Заменить видео' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Пауза' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows quota guidance without an immediate retry delay', async () => {
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: { get: () => '120' },
      json: vi.fn().mockResolvedValue({ error: 'quota_exceeded', retryable: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    const input = screen.getByLabelText('ССЫЛКА НА ВИДЕО') as HTMLInputElement;
    fireEvent.change(input, { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('alert').textContent?.toLowerCase()).toContain('квот'));
    const alert = screen.getByRole('alert').textContent ?? '';
    expect(alert.toLowerCase()).toContain('квот');
    expect(alert).not.toContain('120');
    expect(alert).not.toContain('через');
    expect(input.value).toBe(url);
  });

  it('commits manual BPM on Enter without clamping partial edits or changing firstBeat', async () => {
    await mountPracticeVideo(7.25);
    const input = screen.getByRole('textbox', { name: 'Темп BPM' }) as HTMLInputElement;
    expect(input.value).toBe('100');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '1' } });
    expect(input.value).toBe('1');
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(100);
    fireEvent.change(input, { target: { value: '128' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!)).toMatchObject({ bpm: 128, firstBeat: 7.25 });
    expect(input.value).toBe('128');
  });

  it.each(['40', '240'])('commits manual BPM boundary %s on blur', async (value) => {
    await mountPracticeVideo();
    const input = screen.getByRole('textbox', { name: 'Темп BPM' });
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(Number(value));
  });

  it.each(['', '128.5', '39', '241', 'abc', '1e2'])(
    'rejects invalid manual BPM %j with an associated accessible error', async (value) => {
      await mountPracticeVideo(7.25);
      const input = screen.getByRole('textbox', { name: 'Темп BPM' }) as HTMLInputElement;
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!)).toMatchObject({ bpm: 100, firstBeat: 7.25 });
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/40.*240/);
      expect(input.getAttribute('aria-describedby')).toBe(alert.id);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.value).toBe('100');
    },
  );

  it('rejects invalid manual BPM on blur and clears the error after a valid edit', async () => {
    await mountPracticeVideo();
    const input = screen.getByRole('textbox', { name: 'Темп BPM' });
    fireEvent.change(input, { target: { value: '39' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(100);
    fireEvent.change(input, { target: { value: '128' } });
    fireEvent.blur(input);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(128);
  });

  it('syncs manual BPM draft after step buttons and Tap Tempo', async () => {
    await mountPracticeVideo();
    const input = screen.getByRole('textbox', { name: 'Темп BPM' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '135' } });
    fireEvent.click(screen.getByRole('button', { name: 'Увеличить BPM' }));
    expect(input.value).toBe('101');
    fireEvent.click(screen.getByRole('button', { name: 'Уменьшить BPM' }));
    expect(input.value).toBe('100');
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(10000);
      fireEvent.click(screen.getByRole('button', { name: 'TAP' }));
      now.mockReturnValue(10500);
      fireEvent.click(screen.getByRole('button', { name: 'TAP' }));
      expect(input.value).toBe('120');
      expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(120);
    } finally { now.mockRestore(); }
  });

  it.each([92, 100])('syncs manual BPM to another video saved at %s and clears the prior error', async (bpm) => {
    await mountPracticeVideo();
    localStorage.setItem('practice:oHg5SJYRHA0', JSON.stringify({ bpm, firstBeat: 3.5 }));
    const input = screen.getByRole('textbox', { name: 'Темп BPM' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '39' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(input, { target: { value: '135' } });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/oHg5SJYRHA0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    expect(input.value).toBe(String(bpm));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(100);
    expect(JSON.parse(localStorage.getItem('practice:oHg5SJYRHA0')!)).toMatchObject({ bpm, firstBeat: 3.5 });
  });

  it('resets Tap Tempo samples when a different video loads', async () => {
    vi.useFakeTimers();
    const baseTime = new Date('2026-11-07T12:00:00Z');
    vi.setSystemTime(baseTime);
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    const input = screen.getByLabelText('ССЫЛКА НА ВИДЕО');
    const loadButton = screen.getByRole('button', { name: 'Загрузить видео' });
    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(loadButton);
    const playerA = MockYouTubePlayer.instances[0];
    act(() => playerA.options.events.onReady({ target: playerA }));
    const tapButton = screen.getByRole('button', { name: 'TAP' });

    fireEvent.click(tapButton);
    vi.setSystemTime(new Date(baseTime.getTime() + 500));
    fireEvent.click(tapButton);
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(120);

    vi.setSystemTime(new Date(baseTime.getTime() + 1000));
    fireEvent.change(input, { target: { value: 'https://youtu.be/oHg5SJYRHA0' } });
    fireEvent.click(loadButton);
    const playerB = MockYouTubePlayer.instances[1];
    act(() => playerB.options.events.onReady({ target: playerB }));

    vi.setSystemTime(new Date(baseTime.getTime() + 2000));
    fireEvent.click(tapButton);
    vi.setSystemTime(new Date(baseTime.getTime() + 2750));
    fireEvent.click(tapButton);

    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(120);
    expect(JSON.parse(localStorage.getItem('practice:oHg5SJYRHA0')!).bpm).toBe(80);
  });

  it('applies a clear local audio BPM to the current video without changing first beat', async () => {
    const player = await mountPracticeVideo();
    const file = new File(['local audio'], 'track.mp3', { type: 'audio/mpeg' });
    estimateBpmFromFile.mockResolvedValue({ bpm: 123, confidence: 0.92, alternatives: [] });

    fireEvent.change(screen.getByLabelText('Выбрать аудиофайл для определения BPM'), { target: { files: [file] } });

    await waitFor(() => expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(123));
    expect((screen.getByRole('textbox', { name: 'Темп BPM' }) as HTMLInputElement).value).toBe('123');
    expect(estimateBpmFromFile).toHaveBeenCalledWith(file);
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).firstBeat).toBe(0);
    expect(localStorage.getItem('local-audio')).toBeNull();
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it.each(['draft', 'error'])('resets manual BPM %s when applying a candidate equal to the saved BPM', async (state) => {
    await mountPracticeVideo(7.25);
    estimateBpmFromFile.mockResolvedValue({ bpm: 100, confidence: 0.34, alternatives: [50] });
    const file = new File(['local audio'], 'track.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Выбрать аудиофайл для определения BPM'), { target: { files: [file] } });
    await screen.findByRole('combobox', { name: 'Подтвердить BPM' });
    const input = screen.getByRole('textbox', { name: 'Темп BPM' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: state === 'draft' ? '135' : '39' } });
    if (state === 'error') {
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(screen.getByRole('alert')).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Применить BPM' }));
    expect(input.value).toBe('100');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!)).toMatchObject({ bpm: 100, firstBeat: 7.25 });
  });

  it('asks before applying an ambiguous half-time candidate', async () => {
    await mountPracticeVideo();
    const file = new File(['local audio'], 'track.mp3', { type: 'audio/mpeg' });
    estimateBpmFromFile.mockResolvedValue({ bpm: 120, confidence: 0.34, alternatives: [60] });

    fireEvent.change(screen.getByLabelText('Выбрать аудиофайл для определения BPM'), { target: { files: [file] } });

    await screen.findByRole('combobox', { name: 'Подтвердить BPM' });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(100);
    fireEvent.change(screen.getByRole('combobox', { name: 'Подтвердить BPM' }), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Применить BPM' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(60));
  });

  it('shows a clear message for an unsupported local audio file', async () => {
    await mountPracticeVideo();
    const file = new File(['local audio'], 'track.mp3', { type: 'audio/mpeg' });
    estimateBpmFromFile.mockRejectedValue(new LocalAudioAnalysisError('unsupported-channels', 'Choose mono or stereo audio.'));

    fireEvent.change(screen.getByLabelText('Выбрать аудиофайл для определения BPM'), { target: { files: [file] } });

    expect((await screen.findByRole('alert')).textContent).toContain('моно или стерео');
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(100);
  });

  it('does not overwrite a manual BPM change made while local audio is being analyzed', async () => {
    let resolveAnalysis!: (value: { bpm: number; confidence: number; alternatives: number[] }) => void;
    const pending = new Promise<{ bpm: number; confidence: number; alternatives: number[] }>((resolve) => { resolveAnalysis = resolve; });
    estimateBpmFromFile.mockReturnValue(pending);
    await mountPracticeVideo();
    const file = new File(['local audio'], 'track.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Выбрать аудиофайл для определения BPM'), { target: { files: [file] } });
    await waitFor(() => expect(estimateBpmFromFile).toHaveBeenCalledWith(file));

    fireEvent.click(screen.getByRole('button', { name: 'Увеличить BPM' }));
    await act(async () => { resolveAnalysis({ bpm: 132, confidence: 0.95, alternatives: [] }); await pending; });

    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(101);
    expect(screen.getByRole('combobox', { name: 'Подтвердить BPM' })).toBeTruthy();
  });

  it('discards a pending local BPM result after switching videos', async () => {
    let resolveAnalysis!: (value: { bpm: number; confidence: number; alternatives: number[] }) => void;
    const pending = new Promise<{ bpm: number; confidence: number; alternatives: number[] }>((resolve) => { resolveAnalysis = resolve; });
    estimateBpmFromFile.mockReturnValue(pending);
    const firstPlayer = await mountPracticeVideo();
    const file = new File(['local audio'], 'track.mp3', { type: 'audio/mpeg' });
    fireEvent.change(screen.getByLabelText('Выбрать аудиофайл для определения BPM'), { target: { files: [file] } });
    await waitFor(() => expect(estimateBpmFromFile).toHaveBeenCalledWith(file));
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/oHg5SJYRHA0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(2));
    const secondPlayer = MockYouTubePlayer.instances[1];
    act(() => secondPlayer.options.events.onReady({ target: secondPlayer }));
    await act(async () => { resolveAnalysis({ bpm: 132, confidence: 0.95, alternatives: [] }); await pending; });
    await pending;
    await waitFor(() => expect(JSON.parse(localStorage.getItem('practice:oHg5SJYRHA0')!).bpm).toBe(100));
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).bpm).toBe(100);
    expect(firstPlayer.playVideo).not.toHaveBeenCalled();
  });

  it('shows service configuration guidance when service_unavailable is not retryable', async () => {
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      headers: { get: () => '120' },
      json: vi.fn().mockResolvedValue({ error: 'service_unavailable', retryable: false }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    const input = screen.getByLabelText('ССЫЛКА НА ВИДЕО') as HTMLInputElement;
    fireEvent.change(input, { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));

    const alert = (await screen.findByRole('alert')).textContent ?? '';
    expect(alert).toContain('не настроен');
    expect(alert).not.toContain('120');
    expect(alert).not.toContain('через');
    expect(input.value).toBe(url);
  });

  it('keeps video controls disabled until a video player is ready', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    expect((screen.getByRole('button', { name: 'Играть' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Назад на 5 секунд' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /ПОВТОР/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /×/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Отметить первую долю/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('slider', { name: 'Позиция видео' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Увеличить BPM' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('Сначала загрузи видео, чтобы управлять воспроизведением.')).toBeTruthy();
  });

  it('recreates the player when the same video is loaded again', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({
      bpm: 100, firstBeat: 0, speed: 0.75, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35,
    }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    const input = screen.getByLabelText('ССЫЛКА НА ВИДЕО');
    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(1));
    const firstPlayer = MockYouTubePlayer.instances[0];
    act(() => firstPlayer.options.events.onReady({ target: firstPlayer }));
    expect(firstPlayer.setPlaybackRate).toHaveBeenCalledWith(0.75);

    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(2));
    const reloadedPlayer = MockYouTubePlayer.instances[1];
    act(() => reloadedPlayer.options.events.onReady({ target: reloadedPlayer }));
    expect(reloadedPlayer.setPlaybackRate).toHaveBeenCalledWith(0.75);
    const metronomeSwitch = screen.getByRole('switch') as HTMLButtonElement;
    fireEvent.click(metronomeSwitch);
    expect(metronomeSwitch.getAttribute('aria-checked')).toBe('true');
    act(() => firstPlayer.options.events.onError({ target: firstPlayer }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(metronomeSwitch.getAttribute('aria-checked')).toBe('true');
  });

  it('resets the active YouTube playback rate to one', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 100, firstBeat: 0, speed: 0.5, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35 }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(0.5);

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));

    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(1);
    expect(screen.getByText('1×')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).speed).toBe(1);
  });

  it('uses the reset playback rate if settings reset before the player is ready', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 100, firstBeat: 0, speed: 0.5, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35 }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    act(() => player.options.events.onReady({ target: player }));

    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(1);
    expect(screen.getByText('1×')).toBeTruthy();
  });

  it('lets the user set and saves metronome volume for the loaded video', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(1));
    fireEvent.change(screen.getByRole('slider', { name: 'Громкость метронома' }), { target: { value: '70' } });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).volume).toBe(0.7);
  });

  it('nudges first-beat alignment by 10 milliseconds without changing other saved settings', async () => {
    const settings = { bpm: 128, timeSignature: 3, firstBeat: 2, speed: 0.75, loopA: 12, loopB: 28, metronomeEnabled: false, volume: 0.6 };
    const otherVideoSettings = { bpm: 91, timeSignature: 4, firstBeat: 4, speed: 1, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35 };
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify(settings));
    localStorage.setItem('practice:M7lc1UVf-VE', JSON.stringify(otherVideoSettings));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));

    const laterNudge = screen.getByRole('button', { name: 'Сдвинуть первую долю на 10 мс позже' });
    expect(screen.getByText('00:02.000')).toBeTruthy();
    fireEvent.click(laterNudge);

    expect(screen.getByText('00:02.010')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!)).toEqual({ ...settings, firstBeat: 2.01 });
    expect(JSON.parse(localStorage.getItem('practice:M7lc1UVf-VE')!)).toEqual(otherVideoSettings);

    fireEvent.click(screen.getByRole('button', { name: 'Сдвинуть первую долю на 10 мс раньше' }));
    expect(screen.getByText('00:02.000')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!)).toEqual(settings);
  });

  it.each([
    [0, 'Сдвинуть первую долю на 10 мс раньше'],
    [180, 'Сдвинуть первую долю на 10 мс позже'],
  ])('disables the out-of-range first-beat adjustment at %s seconds', async (firstBeat, label) => {
    await mountPracticeVideo(firstBeat);
    expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(true);
  });

  it('disables a forward nudge when the duration has no later millisecond position', async () => {
    await mountPracticeVideo(180);
    const player = MockYouTubePlayer.instances[0];
    vi.spyOn(player, 'getDuration').mockReturnValue(180.0004);
    act(() => player.options.events.onReady({ target: player }));
    expect(screen.getByRole('button', { name: 'Сдвинуть первую долю на 10 мс позже' }).hasAttribute('disabled')).toBe(true);
  });

  it('disables a forward nudge when the marked first beat is the fractional video endpoint', async () => {
    const videoEnd = 180.0004;
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 100, firstBeat: videoEnd, speed: 0.5, loopA: 10, loopB: 20, metronomeEnabled: false, volume: 0.35 }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    vi.spyOn(player, 'getDuration').mockReturnValue(videoEnd);
    act(() => player.options.events.onReady({ target: player }));
    expect(screen.getByRole('button', { name: 'Сдвинуть первую долю на 10 мс позже' }).hasAttribute('disabled')).toBe(true);
  });

  it('keeps first-beat adjustment disabled before player readiness', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Сдвинуть первую долю на 10 мс раньше' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Сдвинуть первую долю на 10 мс позже' }).hasAttribute('disabled')).toBe(true);
  });

  it('saves and restores the selected meter per video', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const firstPlayer = MockYouTubePlayer.instances[0];
    act(() => firstPlayer.options.events.onReady({ target: firstPlayer }));
    fireEvent.click(screen.getByRole('button', { name: 'Размер такта 3/4' }));
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).timeSignature).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    const secondPlayer = MockYouTubePlayer.instances[1];
    act(() => secondPlayer.options.events.onReady({ target: secondPlayer }));
    expect(screen.getByRole('button', { name: 'Размер такта 3/4' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Размер такта 4/4' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('uses Space and arrow keys for playback and bounded seeking', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.keyDown(window, { key: ' ' });
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(player.seekTo).toHaveBeenLastCalledWith(5, true);
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '178' } });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(player.seekTo).toHaveBeenLastCalledWith(180, true);
    expect(screen.getByText('03:00', { selector: 'strong' })).toBeTruthy();
  });

  it('ignores keyboard playback shortcuts in editable fields and before player readiness', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    const urlInput = screen.getByLabelText('ССЫЛКА НА ВИДЕО');
    fireEvent.keyDown(urlInput, { key: ' ' });
    expect(player.playVideo).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: ' ' });
    expect(player.playVideo).not.toHaveBeenCalled();
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.keyDown(urlInput, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Позиция видео' }), { key: 'ArrowRight' });
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it('ignores app shortcuts inside plaintext-only editable content', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));

    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'PLAINTEXT-ONLY');
    document.body.appendChild(editor);
    try {
      fireEvent.keyDown(editor, { key: 'm' });
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    } finally {
      editor.remove();
    }
  });

  it('does not treat Space on a focused button as the global play shortcut', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const meterButton = screen.getByRole('button', { name: 'Размер такта 3/4' });
    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    fireEvent(meterButton, spaceEvent);
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(spaceEvent.defaultPrevented).toBe(false);
  });

  it('keeps A, B, and M shortcuts working while a button has focus', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const position = screen.getByRole('slider', { name: 'Позиция видео' });

    fireEvent.change(position, { target: { value: '12' } });
    const meterButton = screen.getByRole('button', { name: 'Размер такта 3/4' });
    meterButton.focus();
    fireEvent.keyDown(meterButton, { key: 'a' });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(12);

    fireEvent.change(position, { target: { value: '20' } });
    const firstBeatButton = screen.getByRole('button', { name: /Отметить первую долю/ });
    firstBeatButton.focus();
    fireEvent.keyDown(firstBeatButton, { key: 'b' });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBe(20);

    const metronomeSwitch = screen.getByRole('switch');
    metronomeSwitch.focus();
    fireEvent.keyDown(metronomeSwitch, { key: 'm' });
    expect(metronomeSwitch.getAttribute('aria-checked')).toBe('true');

    firstBeatButton.focus();
    fireEvent.keyDown(firstBeatButton, { key: 'ArrowRight' });
    expect(player.seekTo).toHaveBeenLastCalledWith(25, true);
  });

  it('keeps A, B, and M shortcuts working with a Russian keyboard layout', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const position = screen.getByRole('slider', { name: 'Позиция видео' });

    fireEvent.change(position, { target: { value: '12' } });
    fireEvent.keyDown(window, { key: 'ф', code: 'KeyA' });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(12);

    fireEvent.change(position, { target: { value: '20' } });
    fireEvent.keyDown(window, { key: 'и', code: 'KeyB' });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBe(20);

    fireEvent.keyDown(window, { key: 'ь', code: 'KeyM' });
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('ignores held-key repeats for toggles and loop markers but keeps repeated seeking', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));

    fireEvent.keyDown(window, { key: ' ', repeat: true });
    fireEvent.keyDown(window, { key: 'm', repeat: true });
    const meterButton = screen.getByRole('button', { name: 'Размер такта 3/4' });
    meterButton.focus();
    fireEvent.keyDown(meterButton, { key: 'a', repeat: true });
    fireEvent.keyDown(meterButton, { key: 'b', repeat: true });
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBeNull();
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBeNull();

    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true });
    fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true });
    expect(player.seekTo).toHaveBeenNthCalledWith(1, 5, true);
    expect(player.seekTo).toHaveBeenNthCalledWith(2, 10, true);
  });

  it('drags A from timeline position, persists the new value, and ignores the release click', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ loopA: 10, loopB: 60 }));
    const { container } = render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const track = container.querySelector('.loop-track') as HTMLDivElement;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 1000, right: 1100, top: 0, bottom: 3, height: 3, x: 100, y: 0, toJSON: () => ({}) } as DOMRect);
    const handleA = container.querySelector('.handle-a') as HTMLButtonElement;
    const setPointerCapture = vi.fn();
    Object.defineProperty(handleA, 'setPointerCapture', { configurable: true, value: setPointerCapture });
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '12' } });
    fireEvent.pointerDown(handleA, { pointerId: 6, button: 0, clientX: 155 });
    fireEvent.pointerUp(handleA, { pointerId: 6, clientX: 155 });
    fireEvent.click(handleA, { detail: 1 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(12);

    fireEvent.pointerDown(handleA, { pointerId: 7, button: 0, clientX: 155 });
    fireEvent.pointerMove(handleA, { pointerId: 7, clientX: 400 });

    expect(setPointerCapture).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(54);
    expect(handleA.getAttribute('aria-label')).toContain('Начало фрагмента A');
    expect(handleA.getAttribute('aria-label')).toContain('00:54');
    expect(track.querySelector('.loop-fill')?.getAttribute('style')).toContain('left: 30%;');

    fireEvent.pointerUp(handleA, { pointerId: 7, clientX: 400 });
    fireEvent.click(handleA, { detail: 1 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(54);

    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '12' } });
    fireEvent.click(handleA);
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(12);

    fireEvent.pointerDown(handleA, { pointerId: 9, button: 0, clientX: 155 });
    fireEvent.pointerUp(handleA, { pointerId: 9, clientX: 400 });
    fireEvent.click(handleA, { detail: 1 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(54);
  });

  it('clamps B and A to the 0.1-second gap and stops moving after pointer cancellation', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ loopA: 20, loopB: 40 }));
    const { container } = render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const track = container.querySelector('.loop-track') as HTMLDivElement;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 1000, right: 1100, top: 0, bottom: 3, height: 3, x: 100, y: 0, toJSON: () => ({}) } as DOMRect);
    const handleA = container.querySelector('.handle-a') as HTMLButtonElement;
    const handleB = container.querySelector('.handle-b') as HTMLButtonElement;
    expect(handleB.getAttribute('aria-label')).toContain('Конец фрагмента B');

    fireEvent.pointerDown(handleB, { pointerId: 2, button: 0, clientX: 322 });
    fireEvent.pointerMove(handleB, { pointerId: 2, clientX: 1200 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBe(180);
    fireEvent.pointerUp(handleB, { pointerId: 2, clientX: 1200 });

    fireEvent.pointerDown(handleB, { pointerId: 3, button: 0, clientX: 1100 });
    fireEvent.pointerMove(handleB, { pointerId: 3, clientX: 50 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBe(20.1);
    fireEvent.pointerUp(handleB, { pointerId: 3, clientX: 50 });

    fireEvent.pointerDown(handleA, { pointerId: 4, button: 0, clientX: 211 });
    fireEvent.pointerMove(handleA, { pointerId: 4, clientX: 1200 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(20);
    fireEvent.pointerCancel(handleA, { pointerId: 4, clientX: 1200 });
    fireEvent.pointerMove(handleA, { pointerId: 4, clientX: 500 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(20);

    fireEvent.pointerDown(handleB, { pointerId: 12, button: 0, clientX: 211 });
    fireEvent.pointerMove(handleB, { pointerId: 12, clientX: 322 });
    fireEvent.lostPointerCapture(handleB, { pointerId: 12 });
    fireEvent.pointerMove(handleB, { pointerId: 12, clientX: 500 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBe(39.96);
  });

  it('can set previously unset A and B boundaries by dragging', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ loopA: null, loopB: null }));
    const { container } = render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const track = container.querySelector('.loop-track') as HTMLDivElement;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 1000, right: 1100, top: 0, bottom: 3, height: 3, x: 100, y: 0, toJSON: () => ({}) } as DOMRect);
    const handleA = container.querySelector('.handle-a') as HTMLButtonElement;
    const handleB = container.querySelector('.handle-b') as HTMLButtonElement;

    fireEvent.pointerDown(handleA, { pointerId: 5, button: 0, clientX: 155 });
    fireEvent.pointerMove(handleA, { pointerId: 5, clientX: 400 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(54);
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBeNull();
    fireEvent.pointerUp(handleA, { pointerId: 5, clientX: 400 });

    fireEvent.pointerDown(handleB, { pointerId: 6, button: 0, clientX: 620 });
    fireEvent.pointerMove(handleB, { pointerId: 6, clientX: 400 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBe(54.1);
    expect(handleB.getAttribute('aria-label')).toContain('00:54');
  });

  it('keeps click-to-set working if the track has no measurable width', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ loopA: 10, loopB: 60 }));
    const { container } = render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const track = container.querySelector('.loop-track') as HTMLDivElement;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 0, right: 100, top: 0, bottom: 3, height: 3, x: 100, y: 0, toJSON: () => ({}) } as DOMRect);
    const handleA = container.querySelector('.handle-a') as HTMLButtonElement;
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '12' } });
    fireEvent.pointerDown(handleA, { pointerId: 8, button: 0, clientX: 155 });
    fireEvent.pointerMove(handleA, { pointerId: 8, clientX: 400 });
    fireEvent.pointerUp(handleA, { pointerId: 8, clientX: 400 });
    fireEvent.click(handleA, { detail: 1 });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(12);
  });

  it('keeps A/B loop polling active during a sustained handle drag', async () => {
    vi.useFakeTimers();
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ loopA: 10, loopB: 20 }));
    const { container } = render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    player.currentTime = 19.5;
    act(() => player.playVideo());
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    player.currentTime = 21;

    const track = container.querySelector('.loop-track') as HTMLDivElement;
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 1000, right: 1100, top: 0, bottom: 3, height: 3, x: 100, y: 0, toJSON: () => ({}) } as DOMRect);
    const handleA = container.querySelector('.handle-a') as HTMLButtonElement;
    fireEvent.pointerDown(handleA, { pointerId: 10, button: 0, clientX: 155 });
    fireEvent.pointerMove(handleA, { pointerId: 10, clientX: 200 });
    await act(async () => { await vi.advanceTimersByTimeAsync(40); });
    fireEvent.pointerMove(handleA, { pointerId: 10, clientX: 220 });
    await act(async () => { await vi.advanceTimersByTimeAsync(40); });

    expect(player.seekTo).toHaveBeenLastCalledWith(19.9, true);
    fireEvent.pointerUp(handleA, { pointerId: 10, clientX: 220 });
  });

  const reportMetric = (label: string) => within(screen.getByRole('dialog', { name: 'Отчёт о тренировке' })).getByText(label).nextElementSibling?.textContent;
  const openReport = () => fireEvent.click(screen.getByRole('button', { name: 'Отчёт' }));
  const emitState = (player: MockYouTubePlayer, state: number) => act(() => {
    player.playerState = state;
    player.options.events.onStateChange({ target: player, data: state });
  });
  const pollAt = async (player: MockYouTubePlayer, time: number) => {
    player.currentTime = time;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
  };
  const naturalRepeat = async (player: MockYouTubePlayer) => {
    await pollAt(player, 10);
    await pollAt(player, 19.8);
    for (const time of [19.84, 19.88, 19.92, 19.96, 20]) await pollAt(player, time);
  };

  it('reports only PLAYING time across pause, buffering, end and error', async () => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    openReport();
    expect(reportMetric('Начальная скорость')).toBe('—');
    emitState(player, 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(reportMetric('Активное время')).toBe('00:02');
    emitState(player, 2);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    emitState(player, 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    emitState(player, 3);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(reportMetric('Активное время')).toBe('00:03');
    emitState(player, 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    emitState(player, 0);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(reportMetric('Активное время')).toBe('00:04');
    emitState(player, 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    act(() => player.options.events.onError({ target: player, data: 100 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(reportMetric('Активное время')).toBe('00:05');
  });

  it('reports one natural return despite repeated polls at B and excludes manual seeks', async () => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    player.seekTo.mockImplementation(() => {});
    emitState(player, 1);
    await naturalRepeat(player);
    await pollAt(player, 20);
    await pollAt(player, 20);
    openReport();
    expect(reportMetric('Повторы A–B')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть отчёт' }));
    await pollAt(player, 10);
    await pollAt(player, 20);
    await pollAt(player, 10);
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '20' } });
    await pollAt(player, 20);
    emitState(player, 2);
    await naturalRepeat(player);
    openReport();
    expect(reportMetric('Повторы A–B')).toBe('1');
  });

  it('reports actual playing speeds and ignores faster paused or buffering speeds', async () => {
    const player = await mountPracticeVideo();
    player.currentRate = 0.75;
    emitState(player, 1);
    player.currentRate = 1;
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    emitState(player, 2);
    player.currentRate = 1.25;
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    emitState(player, 3);
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    openReport();
    expect(reportMetric('Начальная скорость')).toBe('0,75×');
    expect(reportMetric('Максимальная скорость')).toBe('1×');
  });

  it('reports only the latest trainer target and reaches it after a natural return', async () => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    emitState(player, 1);
    await naturalRepeat(player);
    openReport();
    expect(reportMetric('Последняя цель')).toBe('0,75× · достигнута');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть отчёт' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    openReport();
    expect(reportMetric('Последняя цель')).toBe('1× · не достигнута');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть отчёт' }));
    await naturalRepeat(player);
    openReport();
    expect(reportMetric('Последняя цель')).toBe('1× · достигнута');
    expect(reportMetric('Максимальная скорость')).toBe('1×');
  });

  it.each([500, 1500])('confirms a trainer target after a buffered acknowledgement delayed by %s ms', async (delay) => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    player.setPlaybackRate.mockImplementation(() => {});
    emitState(player, 1);
    await naturalRepeat(player);
    openReport();
    expect(reportMetric('Последняя цель')).toBe('0,75× · не достигнута');
    expect(reportMetric('Максимальная скорость')).toBe('0,5×');
    // Seeking to A can buffer before YouTube acknowledges the rate change.
    emitState(player, 3);
    await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
    player.currentRate = 0.75;
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    expect(reportMetric('Последняя цель')).toBe('0,75× · достигнута');
    expect(reportMetric('Максимальная скорость')).toBe('0,5×');
    emitState(player, 1);
    expect(reportMetric('Максимальная скорость')).toBe('0,75×');
  });

  it.each([1, 1.25])('keeps a trainer targeting %s active when an earlier manual rate command is acknowledged', async (target) => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    player.setPlaybackRate.mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: /0.5×/ }));
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    if (target === 1.25) fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1.25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    expect(screen.getByRole('button', { name: 'Остановить тренажёр' })).toBeTruthy();
    emitState(player, 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    player.currentRate = 0.75;
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    expect(screen.getByRole('button', { name: 'Остановить тренажёр' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /0.75×/ })).toBeTruthy();
    openReport();
    expect(reportMetric('Последняя цель')).toBe(target === 1 ? '1× · не достигнута' : '1,25× · не достигнута');
    expect(reportMetric('Максимальная скорость')).toBe('0,75×');
  });

  const requestUnconfirmedTarget = async (player: MockYouTubePlayer) => {
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    player.setPlaybackRate.mockImplementation(() => {});
    emitState(player, 1);
    await naturalRepeat(player);
    emitState(player, 3);
  };

  it('rejects a pending target acknowledgement after report reset', async () => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    await requestUnconfirmedTarget(player);
    openReport();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить отчёт' }));
    player.currentRate = 0.75;
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    expect(reportMetric('Последняя цель')).toBe('—');
    expect(reportMetric('Максимальная скорость')).toBe('—');
    emitState(player, 1);
    expect(reportMetric('Последняя цель')).toBe('—');
    expect(reportMetric('Максимальная скорость')).toBe('0,75×');
  });

  it.each(['manual speed', 'new target', 'seek', 'loop change', 'settings reset'])('rejects a pending target acknowledgement after %s', async (action) => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    await requestUnconfirmedTarget(player);
    if (action === 'manual speed') fireEvent.click(screen.getByRole('button', { name: /0.75×/ }));
    if (action === 'new target') fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1.25' } });
    if (action === 'seek') fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '12' } });
    if (action === 'loop change') fireEvent.click(screen.getByRole('button', { name: 'ОЧИСТИТЬ' }));
    if (action === 'settings reset') fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }));
    player.currentRate = 0.75;
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    openReport();
    expect(reportMetric('Последняя цель')).toBe('0,75× · не достигнута');
    expect(reportMetric('Максимальная скорость')).toBe('0,5×');
    if (action === 'new target') {
      fireEvent.click(screen.getByRole('button', { name: 'Закрыть отчёт' }));
      fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
      act(() => player.options.events.onPlaybackRateChange({ target: player }));
      openReport();
      expect(reportMetric('Последняя цель')).toBe('1,25× · не достигнута');
    }
  });

  it('invalidates a pending trainer target when the native player reports a different rate', async () => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    await requestUnconfirmedTarget(player);
    player.currentRate = 1;
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    player.currentRate = 0.75;
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    openReport();
    expect(reportMetric('Последняя цель')).toBe('0,75× · не достигнута');
  });

  it('rejects an old player target acknowledgement after video replacement and a new target', async () => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    await requestUnconfirmedTarget(player);
    localStorage.setItem('practice:oHg5SJYRHA0', JSON.stringify({ speed: 0.5, loopA: 10, loopB: 20 }));
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/oHg5SJYRHA0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    const replacement = MockYouTubePlayer.instances[1];
    act(() => replacement.options.events.onReady({ target: replacement }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    player.currentRate = 0.75;
    act(() => player.options.events.onPlaybackRateChange({ target: player }));
    openReport();
    expect(reportMetric('Последняя цель')).toBe('0,75× · не достигнута');
    expect(reportMetric('Начальная скорость')).toBe('—');
  });

  it('resets report counters while continuing playback and the active trainer without saving settings', async () => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    emitState(player, 1);
    await naturalRepeat(player);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    const saved = localStorage.getItem('practice:dQw4w9WgXcQ');
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    try {
      openReport();
      fireEvent.click(screen.getByRole('button', { name: 'Сбросить отчёт' }));
      expect(reportMetric('Повторы A–B')).toBe('0');
      expect(reportMetric('Активное время')).toBe('00:00');
      expect(reportMetric('Начальная скорость')).toBe('0,75×');
      expect(reportMetric('Максимальная скорость')).toBe('0,75×');
      expect(reportMetric('Последняя цель')).toBe('1× · не достигнута');
      expect(screen.getByRole('button', { name: 'Остановить тренажёр' })).toBeTruthy();
      expect(player.playerState).toBe(1);
      expect(player.pauseVideo).not.toHaveBeenCalled();
      expect(storageWrite).not.toHaveBeenCalled();
      expect(localStorage.getItem('practice:dQw4w9WgXcQ')).toBe(saved);
    } finally { storageWrite.mockRestore(); }
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(reportMetric('Активное время')).toBe('00:01');
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть отчёт' }));
    await naturalRepeat(player);
    openReport();
    expect(reportMetric('Последняя цель')).toBe('1× · достигнута');
    expect(reportMetric('Повторы A–B')).toBe('1');
  });

  it.each([2, 3])('leaves reset speed metrics empty in player state %s until PLAYING', async (state) => {
    const player = await mountPracticeVideo();
    emitState(player, 1);
    emitState(player, state);
    openReport();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить отчёт' }));
    expect(reportMetric('Начальная скорость')).toBe('—');
    expect(reportMetric('Максимальная скорость')).toBe('—');
    player.currentRate = 0.75;
    emitState(player, 1);
    expect(reportMetric('Начальная скорость')).toBe('0,75×');
    expect(reportMetric('Максимальная скорость')).toBe('0,75×');
  });

  it('closes and clears the report on video change and ignores old player events', async () => {
    const player = await mountPracticeVideo();
    emitState(player, 1);
    openReport();
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/oHg5SJYRHA0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const replacement = MockYouTubePlayer.instances[1];
    act(() => replacement.options.events.onReady({ target: replacement }));
    emitState(player, 1);
    openReport();
    expect(reportMetric('Повторы A–B')).toBe('0');
    expect(reportMetric('Активное время')).toBe('00:00');
    expect(reportMetric('Начальная скорость')).toBe('—');
    expect(reportMetric('Последняя цель')).toBe('—');
  });

  it('contains report focus and restores it without pausing playback', async () => {
    const player = await mountPracticeVideo();
    emitState(player, 1);
    const trigger = screen.getByRole('button', { name: 'Отчёт' });
    trigger.focus();
    openReport();
    const close = screen.getByRole('button', { name: 'Закрыть отчёт' });
    const reset = screen.getByRole('button', { name: 'Сбросить отчёт' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(reset);
    fireEvent.keyDown(reset, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    openReport();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть отчёт' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(player.pauseVideo).not.toHaveBeenCalled();
    expect(player.playerState).toBe(1);
  });

  it('steps once per completed A/B pass and stops after reaching the chosen speed', async () => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    player.seekTo.mockImplementation(() => {});
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    act(() => player.playVideo());
    player.currentTime = 10;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    player.currentTime = 19.8;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    for (const time of [19.84, 19.88, 19.92, 19.96, 20]) {
      player.currentTime = time;
      await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(160); });
    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(0.75);
    expect(player.seekTo).toHaveBeenCalledWith(10, true);

    player.currentTime = 10;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    player.currentTime = 19.8;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    for (const time of [19.86, 19.92, 19.98, 20]) {
      player.currentTime = time;
      await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    }
    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(1);
    expect(screen.getByText('Целевая скорость 1× достигнута.')).toBeTruthy();

    player.currentTime = 10;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    player.currentTime = 19.8;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    player.currentTime = 20;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    expect(player.setPlaybackRate).toHaveBeenCalledTimes(3);
  });

  it('stops the speed trainer when the user changes speed manually', async () => {
    const player = await mountPracticeVideo();
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));

    fireEvent.click(screen.getByRole('button', { name: /0.5×/ }));
    act(() => player.options.events.onPlaybackRateChange({ target: player }));

    expect(screen.getByRole('button', { name: 'Запустить тренажёр' })).toBeTruthy();
    expect(screen.getByText('Тренажёр остановлен: скорость изменена вручную.')).toBeTruthy();
    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(0.75);
  });

  it('does not count a seek past B in the YouTube player as a completed pass', async () => {
    vi.useFakeTimers();
    const player = await mountPracticeVideo();
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    act(() => player.playVideo());
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });

    player.currentTime = 20;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });

    expect(player.seekTo).toHaveBeenCalledWith(10, true);
    expect(player.setPlaybackRate).not.toHaveBeenCalledWith(0.75);
    expect(screen.getByRole('button', { name: 'Остановить тренажёр' })).toBeTruthy();
  });

  it('stops the speed trainer when either loop marker changes', async () => {
    await mountPracticeVideo();
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));

    fireEvent.click(screen.getByRole('button', { name: 'ОЧИСТИТЬ' }));

    expect(screen.getByRole('button', { name: 'Запустить тренажёр' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Тренажёр остановлен: изменились границы A–B.')).toBeTruthy();
  });

  it('stops the speed trainer when another video is loaded', async () => {
    const player = await mountPracticeVideo();
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Запустить тренажёр' }));
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ eligible: true }) }));

    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/oHg5SJYRHA0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(2));
    const replacementPlayer = MockYouTubePlayer.instances[1];
    act(() => replacementPlayer.options.events.onReady({ target: replacementPlayer }));

    expect(screen.getByRole('button', { name: 'Запустить тренажёр' })).toBeTruthy();
    expect(screen.getByText('Тренажёр остановлен: загружено другое видео.')).toBeTruthy();
    expect(player.setPlaybackRate).toHaveBeenCalledTimes(1);
  });

  it('does not allow arming when the A/B loop is invalid', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 100, firstBeat: 0, speed: 0.5, loopA: 10, loopB: 10, metronomeEnabled: false, volume: 0.35 }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.click(screen.getByText('Тренажёр скорости'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Целевая скорость' }), { target: { value: '1' } });

    expect(screen.getByRole('button', { name: 'Запустить тренажёр' }).hasAttribute('disabled')).toBe(true);
    expect(document.querySelector('.speed-ladder-status')?.textContent).toContain('Отметь начало A и конец B.');
    expect(player.setPlaybackRate).toHaveBeenCalledTimes(1);
  });

  it('shows the correct way to reopen shortcut help after clicking the video', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Горячие клавиши' }));
    expect(screen.getByText('Если после клика по видео клавиши не срабатывают, нажми кнопку «?» в панели.')).toBeTruthy();
  });

  it('sets loop markers, toggles the metronome, and shows shortcut help from the keyboard', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '12' } });
    fireEvent.keyDown(window, { key: 'a' });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(12);
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '20' } });
    fireEvent.keyDown(window, { key: 'b' });
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBe(20);
    fireEvent.keyDown(window, { key: 'm' });
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: 'Горячие клавиши' })).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    expect(player.playVideo).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Горячие клавиши' })).toBeNull();
  });

  it('moves focus into shortcut help, traps Tab, and restores focus to its opener', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const opener = screen.getByRole('button', { name: 'Горячие клавиши' });
    opener.focus();
    fireEvent.click(opener);
    const closeButton = screen.getByRole('button', { name: 'Закрыть горячие клавиши' });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(closeButton, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.click(closeButton);
    expect(document.activeElement).toBe(opener);
  });

  it('waits for the next beat grid after an off-beat seek and adjusts for slow playback', async () => {
    vi.useFakeTimers();
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 120, firstBeat: 1, speed: 0.5, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35 }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '2.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    expect(MockAudioContext.instance.oscillators).toHaveLength(1);
    expect(MockAudioContext.instance.oscillators[0].start).toHaveBeenCalledWith(expect.closeTo(0.8));
  });

  it('updates the metronome downbeat accent when the meter changes during playback', async () => {
    vi.useFakeTimers();
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 60, firstBeat: 0, timeSignature: 4, speed: 1, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35 }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    expect(MockAudioContext.instance.oscillators.at(-1)?.frequency.value).toBe(1200);
    fireEvent.click(screen.getByRole('button', { name: 'Размер такта 3/4' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    expect(MockAudioContext.instance.oscillators.at(-1)?.frequency.value).toBe(850);
  });

  it('cancels an off-grid pending click when the A/B loop returns to A', async () => {
    vi.useFakeTimers();
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 120, firstBeat: 1, speed: 1.25, loopA: 4.1, loopB: 4.4, metronomeEnabled: false, volume: 0.35 }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '4.4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    expect(player.seekTo).toHaveBeenCalledWith(4.1, true);
    expect(MockAudioContext.instance.oscillators.length).toBeGreaterThanOrEqual(2);
    expect(MockAudioContext.instance.oscillators[0].stop).toHaveBeenCalled();
    const rescheduled = MockAudioContext.instance.oscillators.at(-1)!;
    expect(rescheduled.start).toHaveBeenCalledWith(expect.closeTo(0.32));
  });

  it('cancels a future click as soon as the player buffers', async () => {
    vi.useFakeTimers();
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 60, firstBeat: 0, speed: 1, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35 }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '0.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    const scheduled = MockAudioContext.instance.oscillators[0];
    expect(scheduled.start).toHaveBeenCalledWith(expect.closeTo(0.7));
    act(() => player.options.events.onStateChange({ target: player, data: 3 }));
    expect(scheduled.stop).toHaveBeenCalled();
  });

  it('stops metronome scheduling after the active player reports an error', async () => {
    vi.useFakeTimers();
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ bpm: 60, firstBeat: 0, timeSignature: 4, speed: 1, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35 }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '0.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    const scheduled = MockAudioContext.instance.oscillators.at(-1)!;
    const oscillatorCount = MockAudioContext.instance.oscillators.length;
    expect(scheduled.start).toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Текущая доля: 1 из 4' }).querySelectorAll('.is-active')).toHaveLength(1);

    act(() => player.options.events.onError({ target: player }));
    expect((screen.getByRole('button', { name: 'Играть' }) as HTMLButtonElement).disabled).toBe(true);
    const metronomeSwitch = screen.getByRole('switch') as HTMLButtonElement;
    expect(metronomeSwitch.disabled).toBe(true);
    expect(metronomeSwitch.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('img', { name: 'Метроном неактивен' }).querySelectorAll('.is-active')).toHaveLength(0);
    expect(scheduled.stop).toHaveBeenCalled();
    player.currentTime = 1;
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(MockAudioContext.instance.oscillators).toHaveLength(oscillatorCount);
  });

  it('shows a loading status while the YouTube player API is pending', async () => {
    (window as any).YT = undefined;
    window.onYouTubeIframeAPIReady = undefined;
    render(<App />);
    const input = screen.getByLabelText('ССЫЛКА НА ВИДЕО') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));

    await waitFor(() => expect(screen.getByText('Подключаю плеер YouTube…')).toBeTruthy());
    const script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    expect(script).toBeTruthy();
    await act(async () => {
      script!.dispatchEvent(new Event('error'));
      await Promise.resolve();
    });
  });

  it('shows an API load error and retries without losing the submitted link', async () => {
    (window as any).YT = undefined;
    window.onYouTubeIframeAPIReady = undefined;
    render(<App />);
    const input = screen.getByLabelText('ССЫЛКА НА ВИДЕО') as HTMLInputElement;
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    fireEvent.change(input, { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const failedScript = await waitFor(() => {
      const script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      expect(script).toBeTruthy();
      return script!;
    });

    await act(async () => {
      failedScript.dispatchEvent(new Event('error'));
      await Promise.resolve();
    });

    expect(screen.getByRole('alert').textContent).toContain('Не удалось подключить плеер YouTube');
    expect(input.value).toBe(url);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    const retryScript = await waitFor(() => {
      const script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
      expect(script).toBeTruthy();
      return script!;
    });
    expect(retryScript).not.toBe(failedScript);

    await act(async () => {
      (window as any).YT = { Player: MockYouTubePlayer };
      window.onYouTubeIframeAPIReady?.();
    });
    expect(MockYouTubePlayer.instances).toHaveLength(1);
    expect(input.value).toBe(url);
  });

  it('offers recovery after the YouTube API times out', async () => {
    vi.useFakeTimers();
    (window as any).YT = undefined;
    window.onYouTubeIframeAPIReady = undefined;
    render(<App />);
    const input = screen.getByLabelText('ССЫЛКА НА ВИДЕО') as HTMLInputElement;
    const url = 'https://youtu.be/dQw4w9WgXcQ';
    fireEvent.change(input, { target: { value: url } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));

    await act(async () => { await vi.advanceTimersByTimeAsync(YOUTUBE_API_TIMEOUT_MS); });
    expect(screen.getByRole('alert').textContent).toContain('Не удалось подключить плеер YouTube');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]')).toHaveLength(1);

    await act(async () => {
      (window as any).YT = { Player: MockYouTubePlayer };
      window.onYouTubeIframeAPIReady?.();
    });
    expect(MockYouTubePlayer.instances).toHaveLength(1);
    expect(input.value).toBe(url);
  });

  it('renders three or four inactive beat markers for the selected meter', () => {
    render(<App />);
    const beatLine = screen.getByRole('img', { name: 'Метроном неактивен' });
    expect(beatLine.getAttribute('aria-live')).toBe('off');
    expect(beatLine.querySelectorAll('span')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Размер такта 3/4' }));
    expect(screen.getByRole('img', { name: 'Метроном неактивен' }).querySelectorAll('span')).toHaveLength(3);
    expect(beatLine.querySelectorAll('.is-active')).toHaveLength(0);
  });

  it('keeps the inactive downbeat visually muted', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve(process.cwd(), 'src/renderer/ui/styles.css'), 'utf8');
    document.head.appendChild(style);
    try {
      render(<App />);
      const firstMarker = screen.getByRole('img', { name: 'Метроном неактивен' }).querySelector('span')!;
      expect(getComputedStyle(firstMarker).backgroundColor).toBe('rgb(55, 55, 47)');
    } finally {
      style.remove();
    }
  });

  it('follows the actual video position through the selected meter and playback-rate changes', async () => {
    vi.useFakeTimers();
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({
      bpm: 100, firstBeat: 0, timeSignature: 3, speed: 1, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35,
    }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '1.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
    fireEvent.click(screen.getByRole('switch'));

    let beatLine = screen.getByRole('img', { name: 'Текущая доля: 3 из 3' });
    expect(beatLine.querySelectorAll('span')).toHaveLength(3);
    expect(beatLine.querySelectorAll('span')[2].classList.contains('is-active')).toBe(true);
    expect(beatLine.querySelectorAll('span')[2].classList.contains('is-downbeat')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /1×/ }));
    expect(player.setPlaybackRate).toHaveBeenLastCalledWith(1.25);
    player.currentTime = 1.8;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    beatLine = screen.getByRole('img', { name: 'Текущая доля: 1 из 3' });
    expect(beatLine.querySelectorAll('span')[0].classList.contains('is-active')).toBe(true);
    expect(beatLine.querySelectorAll('span')[0].classList.contains('is-downbeat')).toBe(true);

    player.currentTime = 2.4;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    beatLine = screen.getByRole('img', { name: 'Текущая доля: 2 из 3' });
    expect(beatLine.querySelectorAll('span')[1].classList.contains('is-active')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Размер такта 4/4' }));
    beatLine = screen.getByRole('img', { name: 'Текущая доля: 1 из 4' });
    expect(beatLine.querySelectorAll('span')[0].classList.contains('is-downbeat')).toBe(true);
  });

  it('reconciles the beat indicator with the actual position after a delayed seek', async () => {
    vi.useFakeTimers();
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({
      bpm: 100, firstBeat: 0, timeSignature: 4, speed: 1, loopA: null, loopB: null, metronomeEnabled: false, volume: 0.35,
    }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    player.seekTo.mockImplementation(() => {});
    player.currentTime = 0.65;
    act(() => player.playVideo());
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    expect(screen.getByRole('img', { name: 'Текущая доля: 2 из 4' }).querySelectorAll('.is-active')).toHaveLength(1);

    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '1.25' } });
    expect(player.seekTo).toHaveBeenLastCalledWith(1.25, true);
    expect(screen.getByRole('img', { name: 'Текущая доля: 3 из 4' }).querySelectorAll('.is-active')).toHaveLength(1);

    player.currentTime = 0.65;
    await act(async () => { await vi.advanceTimersByTimeAsync(80); });
    expect(screen.getByRole('img', { name: 'Текущая доля: 2 из 4' }).querySelectorAll('.is-active')).toHaveLength(1);
  });

  it('dims every beat marker during buffering, pause, and when the metronome is off', async () => {
    vi.useFakeTimers();
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    fireEvent.change(screen.getByRole('slider', { name: 'Позиция видео' }), { target: { value: '0.65' } });
    fireEvent.click(screen.getByRole('button', { name: 'Играть' }));
    fireEvent.click(screen.getByRole('switch'));
    const activeLine = screen.getByRole('img', { name: 'Текущая доля: 2 из 4' });
    expect(activeLine.querySelectorAll('.is-active')).toHaveLength(1);

    act(() => player.options.events.onStateChange({ target: player, data: 3 }));
    let inactiveLine = screen.getByRole('img', { name: 'Метроном неактивен' });
    expect(inactiveLine.querySelectorAll('.is-active')).toHaveLength(0);

    act(() => player.playVideo());
    expect(screen.getByRole('img', { name: 'Текущая доля: 2 из 4' }).querySelectorAll('.is-active')).toHaveLength(1);
    act(() => player.pauseVideo());
    inactiveLine = screen.getByRole('img', { name: 'Метроном неактивен' });
    expect(inactiveLine.querySelectorAll('.is-active')).toHaveLength(0);

    act(() => player.playVideo());
    fireEvent.click(screen.getByRole('switch'));
    inactiveLine = screen.getByRole('img', { name: 'Метроном неактивен' });
    expect(inactiveLine.querySelectorAll('.is-active')).toHaveLength(0);
  });
});

describe('saved practice segments', () => {
  beforeEach(() => {
    localStorage.clear();
    MockYouTubePlayer.instances = [];
    window.onYouTubeIframeAPIReady = undefined;
    document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach((script) => script.remove());
    vi.stubGlobal('AudioContext', MockAudioContext);
    window.YT = { Player: MockYouTubePlayer };
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  async function loadReadyVideo(videoId = 'dQw4w9WgXcQ', markPlayerReady = true) {
    vi.stubEnv('VITE_ELIGIBILITY_API', 'https://eligibility.example');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ eligible: true }) }));
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: `https://youtu.be/${videoId}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(1));
    const player = MockYouTubePlayer.instances[0];
    if (markPlayerReady) act(() => player.options.events.onReady({ target: player }));
    return player;
  }

  async function saveRange(from: number, to: number, label: string) {
    const position = screen.getByLabelText('Позиция видео');
    fireEvent.change(position, { target: { value: from } });
    fireEvent.click(screen.getByRole('button', { name: /НАЧАЛО/ }));
    fireEvent.change(position, { target: { value: to } });
    fireEvent.click(screen.getByRole('button', { name: /КОНЕЦ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить фрагмент' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название фрагмента' }), { target: { value: label } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(`Выбрать фрагмент: ${label}`) })).toBeTruthy());
  }

  it('saves multiple ranges, restores a selected range and seeks without autoplay', async () => {
    const player = await loadReadyVideo();
    await saveRange(12, 28, 'Куплет');
    await saveRange(54, 82, 'Соло');

    expect(JSON.parse(localStorage.getItem('practice-segments:dQw4w9WgXcQ')!)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Выбрать фрагмент: Куплет/ }));
    expect(player.seekTo).toHaveBeenCalledWith(12, true);
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopA).toBe(12);
    expect(JSON.parse(localStorage.getItem('practice:dQw4w9WgXcQ')!).loopB).toBe(28);
    expect(player.playVideo).not.toHaveBeenCalled();
  });

  it('keeps named ranges when changing videos and restores them when returning', async () => {
    await loadReadyVideo();
    await saveRange(12, 28, 'Куплет');
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/oHg5SJYRHA0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    await waitFor(() => expect(MockYouTubePlayer.instances).toHaveLength(2));
    expect(screen.queryByRole('button', { name: /Выбрать фрагмент: Куплет/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Заменить видео' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Выбрать фрагмент: Куплет/ })).toBeTruthy());
  });

  it('renames and deletes only the chosen saved range', async () => {
    await loadReadyVideo();
    await saveRange(12, 28, 'Куплет');
    await saveRange(54, 82, 'Соло');
    fireEvent.click(screen.getByRole('button', { name: 'Переименовать фрагмент Куплет' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Новое название: Куплет' }), { target: { value: 'Первый куплет' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить имя' }));
    expect(screen.getByRole('button', { name: /Выбрать фрагмент: Первый куплет/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить фрагмент Соло' }));
    expect(screen.queryByRole('button', { name: /Выбрать фрагмент: Соло/ })).toBeNull();
    expect(JSON.parse(localStorage.getItem('practice-segments:dQw4w9WgXcQ')!)).toMatchObject([{ label: 'Первый куплет' }]);
  });

  it('disables saving until a complete A/B range exists', async () => {
    await loadReadyVideo();
    expect(screen.getByRole('button', { name: 'Сохранить фрагмент' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Отметь начало A и конец B, чтобы сохранить фрагмент.')).toBeTruthy();
    const position = screen.getByLabelText('Позиция видео');
    fireEvent.change(position, { target: { value: 12 } });
    fireEvent.click(screen.getByRole('button', { name: /НАЧАЛО/ }));
    expect(screen.getByRole('button', { name: 'Сохранить фрагмент' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(position, { target: { value: 28 } });
    fireEvent.click(screen.getByRole('button', { name: /КОНЕЦ/ }));
    expect(screen.getByRole('button', { name: 'Сохранить фрагмент' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText('Отметь начало A и конец B, чтобы сохранить фрагмент.')).toBeNull();
  });

  it('explains and rejects a duplicate name without replacing existing segments', async () => {
    await loadReadyVideo();
    await saveRange(12, 28, 'Куплет');
    const position = screen.getByLabelText('Позиция видео');
    fireEvent.change(position, { target: { value: 54 } });
    fireEvent.click(screen.getByRole('button', { name: /НАЧАЛО/ }));
    fireEvent.change(position, { target: { value: 82 } });
    fireEvent.click(screen.getByRole('button', { name: /КОНЕЦ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить фрагмент' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название фрагмента' }), { target: { value: 'куплет' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Название уже используется');
    expect(JSON.parse(localStorage.getItem('practice-segments:dQw4w9WgXcQ')!)).toHaveLength(1);
  });

  it('does not let a saved range extend past the current video duration', async () => {
    localStorage.setItem('practice-segments:dQw4w9WgXcQ', JSON.stringify([{ id: 'stale-range', label: 'Длинный фрагмент', loopA: 10, loopB: 240 }]));
    const player = await loadReadyVideo();
    fireEvent.click(screen.getByText('Сохранённые фрагменты'));
    const staleRange = await screen.findByRole('button', { name: /Выбрать фрагмент: Длинный фрагмент/ });
    expect(staleRange.hasAttribute('disabled')).toBe(true);
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it('explains that saved ranges are unavailable while the player loads', async () => {
    localStorage.setItem('practice-segments:dQw4w9WgXcQ', JSON.stringify([{ id: 'saved-range', label: 'Припев', loopA: 12, loopB: 24 }]));
    await loadReadyVideo('dQw4w9WgXcQ', false);
    fireEvent.click(screen.getByText('Сохранённые фрагменты'));
    const range = await screen.findByRole('button', { name: /Выбрать фрагмент: Припев/ });
    expect(range.getAttribute('title')).toBe('Дождись загрузки плеера.');
  });

  it('explains when the active A/B markers no longer fit the video duration', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ loopA: 10, loopB: 240 }));
    await loadReadyVideo();
    expect(screen.getByText('Этот диапазон не помещается в видео. Отметь A/B заново.')).toBeTruthy();
  });

  it('treats a non-finite player duration as unknown and keeps saving disabled', async () => {
    localStorage.setItem('practice:dQw4w9WgXcQ', JSON.stringify({ loopA: 10, loopB: 15 }));
    vi.spyOn(MockYouTubePlayer.prototype, 'getDuration').mockReturnValue(Number.POSITIVE_INFINITY);
    await loadReadyVideo();
    expect(screen.getByRole('button', { name: 'Сохранить фрагмент' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Не удалось определить длительность видео.')).toBeTruthy();
  });

  it('keeps the saved list unchanged and announces local-storage write errors', async () => {
    await loadReadyVideo();
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.startsWith('practice-segments:')) throw new Error('unavailable');
      originalSetItem.call(this, key, value);
    });
    const position = screen.getByLabelText('Позиция видео');
    fireEvent.change(position, { target: { value: 12 } });
    fireEvent.click(screen.getByRole('button', { name: /НАЧАЛО/ }));
    fireEvent.change(position, { target: { value: 28 } });
    fireEvent.click(screen.getByRole('button', { name: /КОНЕЦ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить фрагмент' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название фрагмента' }), { target: { value: 'Куплет' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось сохранить фрагмент');
    expect(screen.queryByRole('button', { name: /Выбрать фрагмент: Куплет/ })).toBeNull();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    window.onYouTubeIframeAPIReady = undefined;
    document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach((script) => script.remove());
    vi.stubGlobal('AudioContext', MockAudioContext);
    window.YT = { Player: MockYouTubePlayer };
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('https://eligibility.example/v1/videos/dQw4w9WgXcQ/eligibility');
    expect(screen.getByRole('alert').textContent).toContain('45 секунд');
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
    const alert = screen.getByRole('alert').textContent ?? '';
    expect(alert.toLowerCase()).toContain('квот');
    expect(alert).not.toContain('120');
    expect(alert).not.toContain('через');
    expect(input.value).toBe(url);
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const alert = screen.getByRole('alert').textContent ?? '';
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

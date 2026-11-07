import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

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
    vi.stubGlobal('AudioContext', MockAudioContext);
    window.YT = { Player: MockYouTubePlayer };
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

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
    act(() => firstPlayer.options.events.onError({ target: firstPlayer }));
    expect(screen.queryByRole('alert')).toBeNull();
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

  it('does not treat Space on a focused button as the global play shortcut', async () => {
    render(<App />);
    await act(async () => { window.onYouTubeIframeAPIReady?.(); });
    fireEvent.change(screen.getByLabelText('ССЫЛКА НА ВИДЕО'), { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить видео' }));
    const player = MockYouTubePlayer.instances[0];
    act(() => player.options.events.onReady({ target: player }));
    const meterButton = screen.getByRole('button', { name: 'Размер такта 3/4' });
    fireEvent.keyDown(meterButton, { key: ' ' });
    expect(player.playVideo).not.toHaveBeenCalled();
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
});

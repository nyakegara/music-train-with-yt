import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

class MockYouTubePlayer {
  static instances: MockYouTubePlayer[] = [];
  readonly options: any;
  loadVideoById = vi.fn();
  setPlaybackRate = vi.fn();
  unMute = vi.fn();

  constructor(_target: HTMLElement, options: any) {
    this.options = options;
    MockYouTubePlayer.instances.push(this);
  }

  destroy() {}
  getDuration() { return 180; }
  getAvailablePlaybackRates() { return [0.5, 0.75, 1]; }
  getPlaybackRate() { return 1; }
  getCurrentTime() { return 0; }
  getPlayerState() { return 2; }
  isMuted() { return false; }
}

describe('YouTube player lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    MockYouTubePlayer.instances = [];
    window.YT = { Player: MockYouTubePlayer };
  });
  afterEach(() => cleanup());

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
  });
});

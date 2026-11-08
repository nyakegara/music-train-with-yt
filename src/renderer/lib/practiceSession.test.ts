import { describe, expect, it } from 'vitest';
import { PracticeSessionTracker } from './practiceSession';

describe('PracticeSessionTracker', () => {
  it('counts only PLAYING intervals and includes a live interval in snapshots', () => {
    const tracker = new PracticeSessionTracker('video-1');
    tracker.startPlayback(100, 0.5);
    expect(tracker.snapshot(1_100).activeMilliseconds).toBe(1_000);
    tracker.stopPlayback(1_100); // pause
    tracker.startPlayback(1_600, 0.75);
    tracker.stopPlayback(2_100); // buffering
    tracker.startPlayback(3_000, 1);
    expect(tracker.snapshot(3_250).activeMilliseconds).toBe(1_750);
    tracker.stopPlayback(3_500);
    expect(tracker.snapshot(4_000).activeMilliseconds).toBe(2_000);
  });

  it('counts one loop only for a natural boundary reported during playback', () => {
    const tracker = new PracticeSessionTracker('video-1');
    tracker.recordLoop(true, 0.5);
    tracker.startPlayback(0, 0.5);
    tracker.recordLoop(false, 0.5);
    tracker.recordLoop(false, 0.5);
    tracker.recordLoop(true, 0.5);
    tracker.recordLoop(false, 0.5);
    tracker.recordLoop(true, 0.5);
    tracker.stopPlayback(100);
    tracker.recordLoop(true, 0.75);
    expect(tracker.snapshot(100).completedLoops).toBe(2);
  });

  it('tracks first and fastest active speeds and replaces the current target', () => {
    const tracker = new PracticeSessionTracker('video-1');
    tracker.recordPlaybackRate(1.25); // ignored while stopped
    tracker.startPlayback(0, 0.5);
    tracker.recordPlaybackRate(0.75);
    tracker.stopPlayback(100);
    tracker.recordPlaybackRate(1.5); // ignored while stopped
    tracker.startPlayback(200, 1);
    tracker.recordPlaybackRate(1.25);
    tracker.setTarget(1.5);
    tracker.markTargetReached(1.5);
    expect(tracker.snapshot(250).targetReached).toBe(true);
    tracker.setTarget(2);
    const snapshot = tracker.snapshot(300);
    expect(snapshot.startingSpeed).toBe(0.5);
    expect(snapshot.fastestSpeed).toBe(1.25);
    expect(snapshot.targetSpeed).toBe(2);
    expect(snapshot.targetReached).toBe(false);
  });

  it('resets active time and speed metrics at the current rate while preserving an unreached target', () => {
    const tracker = new PracticeSessionTracker('video-1');
    tracker.setTarget(1.5);
    tracker.startPlayback(0, 0.5);
    tracker.recordLoop(true, 0.5);
    tracker.markTargetReached(1.5);
    tracker.reset(100, 0.75, 1.5);
    expect(tracker.snapshot(100)).toEqual({
      videoId: 'video-1',
      activeMilliseconds: 0,
      completedLoops: 0,
      startingSpeed: 0.75,
      fastestSpeed: 0.75,
      targetSpeed: 1.5,
      targetReached: false,
    });
    expect(tracker.snapshot(150).activeMilliseconds).toBe(50);
  });

  it('leaves speed metrics empty when reset while stopped until playback resumes', () => {
    const tracker = new PracticeSessionTracker('video-1');
    tracker.startPlayback(0, 1.5);
    tracker.stopPlayback(100);

    tracker.reset(200, 1.5, null);
    expect(tracker.snapshot(200)).toMatchObject({
      activeMilliseconds: 0,
      startingSpeed: null,
      fastestSpeed: null,
    });

    tracker.startPlayback(300, 0.5);
    expect(tracker.snapshot(300)).toMatchObject({
      activeMilliseconds: 0,
      startingSpeed: 0.5,
      fastestSpeed: 0.5,
    });
  });
});

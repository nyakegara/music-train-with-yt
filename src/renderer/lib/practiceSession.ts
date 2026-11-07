export type PracticeSessionSnapshot = {
  videoId: string;
  activeMilliseconds: number;
  completedLoops: number;
  startingSpeed: number | null;
  fastestSpeed: number | null;
  targetSpeed: number | null;
  targetReached: boolean;
};

export class PracticeSessionTracker {
  private activeMilliseconds = 0;
  private playbackStartedAt: number | null = null;
  private completedLoops = 0;
  private startingSpeed: number | null = null;
  private fastestSpeed: number | null = null;
  private targetSpeed: number | null = null;
  private targetReached = false;

  constructor(private readonly videoId: string) {}

  startPlayback(nowMs: number, rate: number): void {
    if (this.playbackStartedAt !== null) return;
    this.playbackStartedAt = nowMs;
    if (this.startingSpeed === null) this.startingSpeed = rate;
    this.recordActiveRate(rate);
  }

  stopPlayback(nowMs: number): void {
    if (this.playbackStartedAt === null) return;
    this.activeMilliseconds += Math.max(0, nowMs - this.playbackStartedAt);
    this.playbackStartedAt = null;
  }

  recordPlaybackRate(rate: number): void {
    if (this.playbackStartedAt !== null) this.recordActiveRate(rate);
  }

  recordLoop(naturalBoundary: boolean, rate: number): void {
    if (!naturalBoundary || this.playbackStartedAt === null) return;
    this.completedLoops += 1;
    this.recordActiveRate(rate);
  }

  setTarget(rate: number): void {
    this.targetSpeed = rate;
    this.targetReached = false;
  }

  markTargetReached(rate: number): void {
    if (this.targetSpeed !== null && rate >= this.targetSpeed) this.targetReached = true;
  }

  snapshot(nowMs: number): PracticeSessionSnapshot {
    const liveMilliseconds = this.playbackStartedAt === null
      ? 0
      : Math.max(0, nowMs - this.playbackStartedAt);
    return {
      videoId: this.videoId,
      activeMilliseconds: this.activeMilliseconds + liveMilliseconds,
      completedLoops: this.completedLoops,
      startingSpeed: this.startingSpeed,
      fastestSpeed: this.fastestSpeed,
      targetSpeed: this.targetSpeed,
      targetReached: this.targetReached,
    };
  }

  reset(nowMs: number, currentRate: number, activeTarget: number | null): void {
    const wasPlaying = this.playbackStartedAt !== null;
    this.activeMilliseconds = wasPlaying ? Math.max(0, nowMs - this.playbackStartedAt!) : 0;
    this.playbackStartedAt = wasPlaying ? nowMs : null;
    this.completedLoops = 0;
    this.startingSpeed = currentRate;
    this.fastestSpeed = currentRate;
    this.targetSpeed = activeTarget;
    this.targetReached = false;
  }

  private recordActiveRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    if (this.fastestSpeed === null || rate > this.fastestSpeed) this.fastestSpeed = rate;
  }
}

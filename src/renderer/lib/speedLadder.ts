export type SpeedLadderOptions = {
  currentRate: number;
  targetRate: number;
  availableRates: number[];
  duration: number;
  loopA: number | null;
  loopB: number | null;
};

function normalizedRates(rates: number[]): number[] {
  return [...new Set(rates.filter((rate) => Number.isFinite(rate) && rate > 0))].sort((a, b) => a - b);
}

export function nextSupportedSpeed(currentRate: number, targetRate: number, availableRates: number[]): number | null {
  if (!Number.isFinite(currentRate) || !Number.isFinite(targetRate) || targetRate <= currentRate) return null;
  const rates = normalizedRates(availableRates);
  if (!rates.includes(currentRate) || !rates.includes(targetRate)) return null;
  return rates.find((rate) => rate > currentRate && rate <= targetRate) ?? null;
}

export function isNaturalLoopBoundary(previousPosition: number | null, position: number, boundary: number, elapsedMs: number, playbackRate: number): boolean {
  if (previousPosition === null || !Number.isFinite(previousPosition) || !Number.isFinite(position) || !Number.isFinite(boundary)) return false;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > 500 || !Number.isFinite(playbackRate) || playbackRate <= 0) return false;
  const elapsedVideoTime = elapsedMs / 1000 * playbackRate;
  const observedVideoTime = position - previousPosition;
  // Allow modest iframe clock jitter while keeping short manual seeks distinct
  // from natural playback. A fixed tolerance accumulates into false positives
  // when a user seeks from just before B.
  const jitterAllowance = Math.min(0.1, elapsedMs / 1000 * 0.25 + 0.02);
  return previousPosition < boundary && position >= boundary && observedVideoTime >= 0 && observedVideoTime <= elapsedVideoTime + jitterAllowance;
}

export function canArmSpeedLadder({ currentRate, targetRate, availableRates, duration, loopA, loopB }: SpeedLadderOptions): boolean {
  return Number.isFinite(duration)
    && duration > 0
    && loopA !== null
    && loopB !== null
    && Number.isFinite(loopA)
    && Number.isFinite(loopB)
    && loopA >= 0
    && loopA < loopB
    && loopB <= duration
    && nextSupportedSpeed(currentRate, targetRate, availableRates) !== null;
}

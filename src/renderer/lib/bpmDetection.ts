export type TempoEstimate = {
  bpm: number;
  confidence: number;
  alternatives: number[];
};

const MIN_DURATION_SECONDS = 4;
const FRAME_SECONDS = 0.005;
const MIN_BPM = 40;
const MAX_BPM = 220;

/** Estimates the dominant pulse rate from mono PCM samples. */
export function estimateBpm(samples: Float32Array, sampleRate: number): TempoEstimate | null {
  if (!(samples instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length === 0) return null;
  if (samples.length / sampleRate < MIN_DURATION_SECONDS) return null;

  let energy = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) return null;
    energy += sample * sample;
  }
  if (energy / samples.length < 1e-7) return null;

  const frameSize = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
  const frameSeconds = frameSize / sampleRate;
  const frameCount = Math.floor(samples.length / frameSize);
  const envelope = new Float64Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let frameEnergy = 0;
    const start = frame * frameSize;
    for (let i = 0; i < frameSize; i += 1) {
      const value = samples[start + i];
      frameEnergy += value * value;
    }
    envelope[frame] = Math.sqrt(frameEnergy / frameSize);
  }

  // Positive envelope changes emphasize attacks while reducing sustained tones.
  const onset = new Float64Array(frameCount);
  let onsetEnergy = 0;
  for (let i = 1; i < frameCount; i += 1) {
    const change = Math.max(0, envelope[i] - envelope[i - 1]);
    onset[i] = change;
    onsetEnergy += change * change;
  }
  if (onsetEnergy < 1e-9) return null;

  const minLag = Math.max(1, Math.floor(60 / MAX_BPM / frameSeconds));
  const maxLag = Math.min(frameCount >> 1, Math.ceil(60 / MIN_BPM / frameSeconds));
  const scores: Array<{ lag: number; score: number }> = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let dot = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let i = lag; i < frameCount; i += 1) {
      const left = onset[i];
      const right = onset[i - lag];
      dot += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const score = dot / Math.sqrt(leftEnergy * rightEnergy || 1);
    scores.push({ lag, score });
  }
  scores.sort((a, b) => b.score - a.score);
  const bestScore = scores[0]?.score ?? 0;
  if (bestScore < 0.5) return null;

  // Prefer the faster interpretation when a slower candidate is an exact multiple;
  // this avoids systematic half-time answers for evenly spaced pulses.
  const peak = scores[0];
  const harmonic = scores.find((item) => item.lag < peak.lag && item.lag >= peak.lag / 4 && Math.abs(peak.lag / item.lag - Math.round(peak.lag / item.lag)) < 0.02 && item.score >= bestScore * 0.25);
  const chosen = harmonic ?? scores.filter((item) => item.score >= bestScore * 0.99).sort((a, b) => a.lag - b.lag)[0];
  const previous = scores.find((item) => item.lag === chosen.lag - 1)?.score ?? chosen.score;
  const next = scores.find((item) => item.lag === chosen.lag + 1)?.score ?? chosen.score;
  const curvature = previous - 2 * chosen.score + next;
  const offset = curvature === 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (previous - next) / curvature));
  const bpm = Math.round(60 / ((chosen.lag + offset) * frameSeconds));
  const halfBpm = bpm / 2;
  const doubleBpm = bpm * 2;
  const halfLag = 60 / halfBpm / frameSeconds;
  const doubleLag = 60 / doubleBpm / frameSeconds;
  const scoreAt = (lag: number) => scores.reduce((nearest, item) => Math.abs(item.lag - lag) < Math.abs(nearest.lag - lag) ? item : nearest, scores[0]).score;
  const halfScore = halfBpm >= MIN_BPM ? scoreAt(halfLag) : 0;
  const doubleScore = doubleBpm <= MAX_BPM ? scoreAt(doubleLag) : 0;
  const alternatives: number[] = [];
  if (halfBpm >= MIN_BPM && halfScore >= bestScore * 0.8) alternatives.push(Math.round(halfBpm));
  if (doubleBpm <= MAX_BPM && doubleScore >= bestScore * 0.8) alternatives.push(Math.round(doubleBpm));
  const ambiguity = Math.max(halfScore, doubleScore) / (bestScore || 1);
  const confidence = Math.max(0, Math.min(1, bestScore * (alternatives.length ? 1 - ambiguity * 0.45 : 1)));
  return { bpm, confidence, alternatives };
}









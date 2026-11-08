export type TempoEstimate = {
  bpm: number;
  confidence: number;
  alternatives: number[];
  firstPulseSeconds: number | null;
  phaseConfidence: number;
};

const MIN_DURATION_SECONDS = 4;
const FRAME_SECONDS = 0.005;
const MIN_BPM = 40;
const MAX_BPM = 220;

type PulsePhaseEstimate = { firstPulseSeconds: number; confidence: number } | null;

function findOnsetPeaks(onset: Float64Array): Array<{ frame: number; strength: number }> {
  let energy = 0;
  for (const value of onset) energy += value * value;
  // Keep quiet intros in play; recurring phase support filters the extra low-level peaks.
  const floor = Math.max(1e-9, Math.sqrt(energy / Math.max(1, onset.length)) * 0.01);
  const peaks: Array<{ frame: number; strength: number }> = [];
  for (let frame = 0; frame < onset.length - 1; frame += 1) {
    const strength = onset[frame];
    if (strength < floor || strength < (onset[frame - 1] ?? 0) || strength <= onset[frame + 1]) continue;
    const previous = peaks[peaks.length - 1];
    // Envelope attacks can span adjacent frames; keep one strongest representative.
    if (previous && frame - previous.frame <= 2) {
      if (strength > previous.strength) peaks[peaks.length - 1] = { frame, strength };
    } else {
      peaks.push({ frame, strength });
    }
  }
  return peaks;
}

function lowerBound(peaks: Array<{ frame: number; strength: number }>, frame: number): number {
  let low = 0;
  let high = peaks.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (peaks[middle].frame < frame) low = middle + 1;
    else high = middle;
  }
  return low;
}

function estimatePulsePhase(onset: Float64Array, frameSeconds: number, periodFrames: number): PulsePhaseEstimate {
  const peaks = findOnsetPeaks(onset);
  if (peaks.length < 3 || !Number.isFinite(periodFrames) || periodFrames < 1) return null;
  let bestResult: PulsePhaseEstimate = null;

  // Keep phase voting local so a tiny period error cannot drift across a long file.
  const windowFrames = Math.min(onset.length, Math.max(Math.round(4 / frameSeconds), Math.ceil(periodFrames * 4)));
  const windowStep = Math.max(1, Math.floor(windowFrames / 2));
  const tolerance = Math.max(2, Math.min(8, Math.round(periodFrames * 0.08)));

  for (let windowStart = 0; windowStart < onset.length; windowStart += windowStep) {
    const windowEnd = Math.min(onset.length - 1, windowStart + windowFrames);
    if (windowEnd - windowStart < periodFrames * 3) break;
    const firstPeak = lowerBound(peaks, windowStart);
    const lastPeak = lowerBound(peaks, windowEnd + 1);
    if (lastPeak - firstPeak < 3) continue;

    let bestPhase = 0;
    let bestPhaseIndex = 0;
    let bestPhaseScore = 0;
    let bestHitCount = 0;
    const phaseCandidates = Math.max(1, Math.ceil(periodFrames));
    const coverageByPhase = new Float64Array(phaseCandidates);
    const hitsByPhase = new Uint16Array(phaseCandidates);
    for (let phaseFrame = 0; phaseFrame < phaseCandidates; phaseFrame += 1) {
      const phase = phaseFrame % periodFrames;
      const firstSlot = Math.ceil((windowStart - phase) / periodFrames);
      const lastSlot = Math.floor((windowEnd - phase) / periodFrames);
      let hits = 0;
      let firstHitSlot = Number.POSITIVE_INFINITY;
      for (let slot = firstSlot; slot <= lastSlot; slot += 1) {
        const expected = phase + slot * periodFrames;
        const peakIndex = lowerBound(peaks, expected - tolerance);
        if (peakIndex < lastPeak && peaks[peakIndex].frame <= expected + tolerance) {
          hits += 1;
          firstHitSlot = Math.min(firstHitSlot, slot);
        }
      }
      if (hits < 3) continue;
      const possibleHits = lastSlot - firstHitSlot + 1;
      const coverage = hits / Math.max(1, possibleHits);
      const phaseScore = coverage * Math.min(1, hits / 8);
      coverageByPhase[phaseFrame] = phaseScore;
      hitsByPhase[phaseFrame] = hits;
      if (phaseScore > bestPhaseScore) {
        bestPhaseScore = phaseScore;
        bestPhase = phase;
        bestPhaseIndex = phaseFrame;
        bestHitCount = hits;
      }
    }

    let secondCoverage = 0;
    for (let phaseFrame = 0; phaseFrame < phaseCandidates; phaseFrame += 1) {
      const phase = phaseFrame % periodFrames;
      const difference = Math.abs(phase - bestPhase);
      const circularDifference = Math.min(difference, periodFrames - difference);
      if (circularDifference > tolerance * 2) secondCoverage = Math.max(secondCoverage, coverageByPhase[phaseFrame]);
    }
    bestHitCount = hitsByPhase[bestPhaseIndex] || bestHitCount;
    const uniqueness = bestPhaseScore > 0 ? Math.max(0, (bestPhaseScore - secondCoverage) / bestPhaseScore) : 0;
    const confidence = bestPhaseScore * uniqueness;
    if (bestHitCount < 3 || confidence < 0.35) continue;

    const matched: Array<{ slot: number; frame: number }> = [];
    const firstSlot = Math.ceil((windowStart - bestPhase) / periodFrames);
    const lastSlot = Math.floor((windowEnd - bestPhase) / periodFrames);
    for (let slot = firstSlot; slot <= lastSlot; slot += 1) {
      const expected = bestPhase + slot * periodFrames;
      const from = lowerBound(peaks, expected - tolerance);
      let closest: { frame: number; distance: number } | null = null;
      for (let index = from; index < lastPeak && peaks[index].frame <= expected + tolerance; index += 1) {
        const distance = Math.abs(peaks[index].frame - expected);
        if (!closest || distance < closest.distance) closest = { frame: peaks[index].frame, distance };
      }
      if (closest) matched.push({ slot, frame: closest.frame });
    }
    if (matched.length < 3) continue;

    // Refine the period from observed attacks in this short window before looking earlier.
    // This prevents small autocorrelation errors from moving the phase by many frames.
    const meanSlot = matched.reduce((sum, item) => sum + item.slot, 0) / matched.length;
    const meanFrame = matched.reduce((sum, item) => sum + item.frame, 0) / matched.length;
    let covariance = 0;
    let slotVariance = 0;
    for (const item of matched) {
      covariance += (item.slot - meanSlot) * (item.frame - meanFrame);
      slotVariance += (item.slot - meanSlot) ** 2;
    }
    const refinedPeriod = slotVariance > 0 ? covariance / slotVariance : periodFrames;
    if (!Number.isFinite(refinedPeriod) || Math.abs(refinedPeriod - periodFrames) > periodFrames * 0.04) continue;
    const refinedPhase = meanFrame - refinedPeriod * meanSlot;
    const refinedTolerance = Math.max(2, Math.min(8, Math.round(refinedPeriod * 0.08)));

    // Find the earliest observed attack followed by two consecutive supported grid hits.
    // That rejects a lone transient which happens to share the later pulse phase.
    let windowResult: PulsePhaseEstimate = null;
    for (const peak of peaks) {
      const beat = Math.round((peak.frame - refinedPhase) / refinedPeriod);
      const expected = refinedPhase + beat * refinedPeriod;
      if (Math.abs(peak.frame - expected) > refinedTolerance) continue;
      let supportedSuccessors = true;
      for (const offset of [1, 2]) {
        const successor = expected + offset * refinedPeriod;
        const index = lowerBound(peaks, successor - refinedTolerance);
        if (index >= peaks.length || peaks[index].frame > successor + refinedTolerance) {
          supportedSuccessors = false;
          break;
        }
      }
      if (supportedSuccessors) {
        windowResult = { firstPulseSeconds: peak.frame * frameSeconds, confidence };
        break;
      }
    }
    if (windowResult && (!bestResult || windowResult.confidence > bestResult.confidence)) bestResult = windowResult;
  }
  return bestResult;
}

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
  const phaseOnset = onset.slice();
  phaseOnset[0] = envelope[0];
  const phase = estimatePulsePhase(phaseOnset, frameSeconds, chosen.lag + offset);
  return { bpm, confidence, alternatives, firstPulseSeconds: phase?.firstPulseSeconds ?? null, phaseConfidence: phase?.confidence ?? 0 };
}









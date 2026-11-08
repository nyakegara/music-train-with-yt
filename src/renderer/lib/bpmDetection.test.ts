import { describe, expect, it } from 'vitest';
import { estimateBpm } from './bpmDetection';

function pulseTrain(bpm: number, seconds = 12, sampleRate = 8_000, firstPulseSeconds = 0, amplitudeForBeat: (beat: number) => number = () => 0.8): Float32Array {
  const samples = new Float32Array(seconds * sampleRate);
  const beatSamples = (60 * sampleRate) / bpm;
  for (let beat = 0; firstPulseSeconds + beat * 60 / bpm < seconds; beat += 1) {
    const start = Math.round(firstPulseSeconds * sampleRate + beat * beatSamples);
    for (let i = 0; i < 80 && start + i < samples.length; i += 1) samples[start + i] = amplitudeForBeat(beat) * Math.exp(-i / 15);
  }
  return samples;
}

describe('estimateBpm', () => {
  it.each([60, 90, 120, 180])('estimates a synthetic %i BPM pulse train', (bpm) => {
    const estimate = estimateBpm(pulseTrain(bpm), 8_000);
    expect(estimate).not.toBeNull();
    expect(Math.abs(estimate!.bpm - bpm)).toBeLessThanOrEqual(1);
    expect(estimate!.confidence).toBeGreaterThan(0);
    expect(Array.isArray(estimate!.alternatives)).toBe(true);
  });
  it.each([40, 220])('supports the design range boundary of %i BPM', (bpm) => {
    const estimate = estimateBpm(pulseTrain(bpm), 8_000);
    expect(estimate).not.toBeNull();
    expect(Math.abs(estimate!.bpm - bpm)).toBeLessThanOrEqual(1);
  });
  it.each([107, 137])('refines a non-grid-aligned %i BPM tempo', (bpm) => {
    const estimate = estimateBpm(pulseTrain(bpm), 8_000);
    expect(estimate).not.toBeNull();
    expect(Math.abs(estimate!.bpm - bpm)).toBeLessThanOrEqual(2);
  });
  it('uses the exact rounded frame duration at the 11.025 kHz analysis rate', () => {
    const estimate = estimateBpm(pulseTrain(137, 12, 11_025), 11_025);
    expect(estimate).not.toBeNull();
    expect(Math.abs(estimate!.bpm - 137)).toBeLessThanOrEqual(1);
  });
  it('reports the half-time candidate for an ambiguous pulse train', () => {
    const estimate = estimateBpm(pulseTrain(120), 8_000);
    expect(estimate?.alternatives).toContain(60);
    expect(estimate!.confidence).toBeLessThan(0.7);
  });
  it.each([
    [120, 0, 12],
    [120, 0.37, 12],
    [120, 1.25, 12],
  ])('estimates the first supported pulse at %s BPM and %.2f seconds', (bpm, firstPulse, duration) => {
    const estimate = estimateBpm(pulseTrain(bpm, duration, 8_000, firstPulse), 8_000);
    expect(estimate).not.toBeNull();
    expect(estimate!.firstPulseSeconds).toBeCloseTo(firstPulse, 2);
    expect(estimate!.phaseConfidence).toBeGreaterThan(0.5);
  });
  it('keeps a single transient before the rhythmic intro from becoming the first pulse', () => {
    const samples = pulseTrain(120, 12, 8_000, 1.25);
    for (let i = 0; i < 80; i += 1) samples[80 + i] = 0.8 * Math.exp(-i / 15);
    const estimate = estimateBpm(samples, 8_000);
    expect(estimate).not.toBeNull();
    expect(estimate!.firstPulseSeconds).toBeCloseTo(1.25, 2);
  });
  it('does not accept an isolated transient on the same phase as a later pulse train', () => {
    const samples = pulseTrain(120, 12, 8_000, 1.25);
    for (let i = 0; i < 80; i += 1) samples[2_000 + i] = 0.8 * Math.exp(-i / 15);
    const estimate = estimateBpm(samples, 8_000);
    expect(estimate).not.toBeNull();
    expect(estimate!.firstPulseSeconds).toBeCloseTo(1.25, 2);
  });
  it('keeps quiet opening pulses when later attacks are much louder', () => {
    const estimate = estimateBpm(pulseTrain(120, 12, 8_000, 0.37, beat => beat < 3 ? 0.008 : 0.8), 8_000);
    expect(estimate).not.toBeNull();
    expect(estimate!.firstPulseSeconds).toBeCloseTo(0.37, 2);
  });
  it('keeps searching after an ambiguous intro for a clearer stable pulse', () => {
    const samples = new Float32Array(12 * 8_000);
    const addPulse = (time: number) => {
      const start = Math.round(time * 8_000);
      for (let i = 0; i < 80; i += 1) samples[start + i] = 0.8 * Math.exp(-i / 15);
    };
    for (const time of [0.2, 0.7, 1.2, 1.7, 2.2]) addPulse(time);
    for (let time = 4.5; time < 12; time += 0.5) addPulse(time);
    const estimate = estimateBpm(samples, 8_000);
    expect(estimate).not.toBeNull();
    expect(estimate!.phaseConfidence).toBeGreaterThan(0.55);
    expect(estimate!.firstPulseSeconds).toBeCloseTo(4.5, 2);
  });
  it('does not report strong phase confidence from only three late attacks', () => {
    const samples = pulseTrain(120, 12, 8_000, 8.5).fill(0);
    for (const time of [8.5, 9, 9.5]) {
      const start = Math.round(time * 8_000);
      for (let i = 0; i < 80; i += 1) samples[start + i] = 0.8 * Math.exp(-i / 15);
    }
    const estimate = estimateBpm(samples, 8_000);
    expect(estimate?.phaseConfidence ?? 0).toBeLessThan(0.55);
  });
  it('does not accumulate phase drift on a long non-grid-aligned tempo', () => {
    const estimate = estimateBpm(pulseTrain(137, 60, 11_025, 0.37), 11_025);
    expect(estimate).not.toBeNull();
    expect(estimate!.firstPulseSeconds).toBeCloseTo(0.37, 2);
    expect(estimate!.phaseConfidence).toBeGreaterThan(0.5);
  });
  it('rejects silence', () => expect(estimateBpm(new Float32Array(80_000), 8_000)).toBeNull());
  it('rejects unstructured noise', () => {
    let seed = 17;
    const noise = new Float32Array(80_000);
    for (let i = 0; i < noise.length; i += 1) { seed = (seed * 16807) % 2147483647; noise[i] = ((seed / 2147483647) * 2 - 1) * 0.2; }
    expect(estimateBpm(noise, 8_000)).toBeNull();
  });
  it('rejects signals too short to establish a pulse pattern', () => expect(estimateBpm(pulseTrain(120, 2), 8_000)).toBeNull());
  it.each([[new Float32Array(64_000), 0], [new Float32Array(64_000), Number.NaN], [new Float32Array([0, Number.NaN, 0]), 8_000]])('rejects invalid input', (samples, sampleRate) => expect(estimateBpm(samples as Float32Array, sampleRate as number)).toBeNull());
});


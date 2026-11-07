import { describe, expect, it } from 'vitest';
import { estimateBpm } from './bpmDetection';

function pulseTrain(bpm: number, seconds = 12, sampleRate = 8_000): Float32Array {
  const samples = new Float32Array(seconds * sampleRate);
  const beatSamples = (60 * sampleRate) / bpm;
  for (let beat = 0; beat < seconds * bpm / 60; beat += 1) {
    const start = Math.round(beat * beatSamples);
    for (let i = 0; i < 80 && start + i < samples.length; i += 1) samples[start + i] = 0.8 * Math.exp(-i / 15);
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


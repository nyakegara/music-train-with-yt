import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { estimateBpm } from './bpmDetection';
import { estimateBpmFromFile, LocalAudioAnalysisError } from './localAudioAnalysis';

vi.mock('./bpmDetection', () => ({ estimateBpm: vi.fn() }));

const estimateMock = vi.mocked(estimateBpm);
let decodedBuffer: AudioBuffer;
let closeMock: ReturnType<typeof vi.fn>;
let decodeMock: ReturnType<typeof vi.fn>;
let audioMetadataMock: { listeners: Record<string, () => void>; duration: number; src: string };
let createObjectUrlMock: ReturnType<typeof vi.fn>;
let revokeObjectUrlMock: ReturnType<typeof vi.fn>;
let audioContextConstructor: ReturnType<typeof vi.fn>;

function makeAudioBuffer(channels: number[][], sampleRate = 22_050): AudioBuffer {
  const length = channels[0]?.length ?? 0;
  return {
    duration: length / sampleRate,
    length,
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData: (channel: number) => new Float32Array(channels[channel]),
  } as unknown as AudioBuffer;
}

function makeFile(size = 200): File {
  return new File([new Uint8Array(size)], 'track.wav', { type: 'audio/wav' });
}

function fileWithSize(size: number): File {
  return { size, arrayBuffer: vi.fn() } as unknown as File;
}

beforeEach(() => {
  decodedBuffer = makeAudioBuffer([Array(110_250).fill(0.25)]);
  closeMock = vi.fn().mockResolvedValue(undefined);
  decodeMock = vi.fn().mockImplementation(async () => decodedBuffer);
  audioMetadataMock = { listeners: {}, duration: 5, src: '' };
  vi.stubGlobal('Audio', vi.fn(function (this: object) {
    Object.assign(this, {
      preload: '',
      duration: audioMetadataMock.duration,
      addEventListener: (type: string, listener: () => void) => { audioMetadataMock.listeners[type] = listener; },
      removeEventListener: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      pause: vi.fn(),
    });
    Object.defineProperty(this, 'src', { set(value: string) { audioMetadataMock.src = value; queueMicrotask(() => audioMetadataMock.listeners.loadedmetadata?.()); } });
  }));
  createObjectUrlMock = vi.fn(() => 'blob:local-audio');
  revokeObjectUrlMock = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: createObjectUrlMock, revokeObjectURL: revokeObjectUrlMock });
  audioContextConstructor = vi.fn(function (this: object) {
    Object.assign(this, { decodeAudioData: decodeMock, close: closeMock });
  });
  vi.stubGlobal('AudioContext', audioContextConstructor);
  estimateMock.mockReturnValue({ bpm: 120, confidence: 0.9, alternatives: [], firstPulseSeconds: null, phaseConfidence: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('estimateBpmFromFile', () => {
  it('decodes in memory, downmixes and resamples to about 11 kHz mono', async () => {
    decodedBuffer = makeAudioBuffer([Array(220_500).fill(0.2), Array(220_500).fill(0.4)], 44_100);
    const result = await estimateBpmFromFile(makeFile());
    expect(decodeMock).toHaveBeenCalledOnce();
    expect(audioContextConstructor).toHaveBeenCalledWith({ sampleRate: 11_025 });
    const [samples, rate] = estimateMock.mock.calls[0];
    expect(rate).toBe(11_025);
    expect(samples).toBeInstanceOf(Float32Array);
    expect(samples.length).toBe(55_125);
    expect(samples[0]).toBeCloseTo(0.3);
    expect(result).toEqual({ bpm: 120, confidence: 0.9, alternatives: [], firstPulseSeconds: null, phaseConfidence: 0 });
    expect(closeMock).toHaveBeenCalledOnce();
    expect(closeMock.mock.invocationCallOrder[0]).toBeLessThan(estimateMock.mock.invocationCallOrder[0]);
  });

  it('rejects empty and oversized files before decoding', async () => {
    await expect(estimateBpmFromFile(makeFile(0))).rejects.toMatchObject({ code: 'invalid-size' });
    await expect(estimateBpmFromFile(fileWithSize(50 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: 'invalid-size' });
    expect(decodeMock).not.toHaveBeenCalled();
  });

  it('rejects decoded audio shorter than four seconds or longer than five minutes', async () => {
    decodedBuffer = makeAudioBuffer([Array(3_999).fill(0)], 1_000);
    await expect(estimateBpmFromFile(makeFile())).rejects.toMatchObject({ code: 'invalid-duration' });
    decodedBuffer = makeAudioBuffer([Array(300_001).fill(0)], 1_000);
    await expect(estimateBpmFromFile(makeFile())).rejects.toMatchObject({ code: 'invalid-duration' });
    expect(estimateMock).not.toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledTimes(2);
  });

  it('checks local media duration before decoding a long file and revokes its temporary URL', async () => {
    audioMetadataMock.duration = 301;
    await expect(estimateBpmFromFile(makeFile())).rejects.toMatchObject({ code: 'invalid-duration' });
    expect(decodeMock).not.toHaveBeenCalled();
    expect(createObjectUrlMock).toHaveBeenCalledOnce();
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:local-audio');
  });

  it('does not decode when local audio metadata cannot be read', async () => {
    // The fake media element dispatches loadedmetadata on its own; make the element report a load error instead.
    const addEventListener = vi.fn((type: string, listener: () => void) => { audioMetadataMock.listeners[type] = listener; });
    vi.stubGlobal('Audio', vi.fn(function (this: object) {
      Object.assign(this, { preload: '', duration: Number.NaN, addEventListener, removeEventListener: vi.fn(), removeAttribute: vi.fn(), load: vi.fn(), pause: vi.fn() });
      Object.defineProperty(this, 'src', { set(_value: string) { queueMicrotask(() => audioMetadataMock.listeners.error?.()); } });
    }));
    await expect(estimateBpmFromFile(makeFile())).rejects.toMatchObject({ code: 'decode-failed' });
    expect(decodeMock).not.toHaveBeenCalled();
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:local-audio');
  });

  it('revokes the temporary URL if the browser cannot create a metadata reader', async () => {
    vi.stubGlobal('Audio', vi.fn(function (this: object) { throw new Error('audio elements unavailable'); }));
    await expect(estimateBpmFromFile(makeFile())).rejects.toMatchObject({ code: 'decode-failed' });
    expect(decodeMock).not.toHaveBeenCalled();
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:local-audio');
  });

  it('rejects surround audio before copying channels into the analysis buffer', async () => {
    decodedBuffer = makeAudioBuffer([Array(110_250).fill(0.1), Array(110_250).fill(0.1), Array(110_250).fill(0.1)]);
    const getChannelData = vi.spyOn(decodedBuffer, 'getChannelData');
    await expect(estimateBpmFromFile(makeFile())).rejects.toMatchObject({ code: 'unsupported-channels' });
    expect(getChannelData).not.toHaveBeenCalled();
    expect(estimateMock).not.toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it('closes the context when decoding fails', async () => {
    decodeMock.mockRejectedValueOnce(new Error('decoder failed'));
    await expect(estimateBpmFromFile(makeFile())).rejects.toBeInstanceOf(LocalAudioAnalysisError);
    expect(closeMock).toHaveBeenCalledOnce();
  });

  it('returns null for an inconclusive signal without persisting or fetching audio', async () => {
    estimateMock.mockReturnValue(null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await estimateBpmFromFile(makeFile());
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
});

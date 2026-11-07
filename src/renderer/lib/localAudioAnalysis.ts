import { estimateBpm, type TempoEstimate } from './bpmDetection';

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MIN_DURATION_SECONDS = 4;
const MAX_DURATION_SECONDS = 5 * 60;
const TARGET_SAMPLE_RATE = 11_025;
const MAX_CHANNELS = 2;
const METADATA_TIMEOUT_MS = 10_000;

export type LocalAudioAnalysisErrorCode = 'invalid-size' | 'invalid-duration' | 'unsupported-channels' | 'decode-failed';

export class LocalAudioAnalysisError extends Error {
  readonly code: LocalAudioAnalysisErrorCode;

  constructor(code: LocalAudioAnalysisErrorCode, message: string) {
    super(message);
    this.name = 'LocalAudioAnalysisError';
    this.code = code;
  }
}

async function readLocalAudioDuration(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  let audio: HTMLAudioElement | null = null;
  try {
    const audioElement = new Audio();
    audio = audioElement;
    audioElement.preload = 'metadata';
    const duration = await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(() => reject(new LocalAudioAnalysisError('decode-failed', 'Audio metadata could not be read. Try another audio file.'))), METADATA_TIMEOUT_MS);
      const cleanup = () => {
        window.clearTimeout(timeout);
        audioElement.removeEventListener('loadedmetadata', onLoadedMetadata);
        audioElement.removeEventListener('error', onError);
      };
      const finish = (complete: () => void) => {
        cleanup();
        complete();
      };
      const onLoadedMetadata = () => finish(() => resolve(audioElement.duration));
      const onError = () => finish(() => reject(new LocalAudioAnalysisError('decode-failed', 'Audio metadata could not be read. Try another audio file.')));
      audioElement.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      audioElement.addEventListener('error', onError, { once: true });
      audioElement.src = objectUrl;
    });
    if (!Number.isFinite(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
      throw new LocalAudioAnalysisError('invalid-duration', 'Audio must be at least 4 seconds and no longer than 5 minutes.');
    }
    return duration;
  } finally {
    try {
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/** Decodes a user-selected file in memory and estimates BPM from temporary mono samples. */
export async function estimateBpmFromFile(file: File): Promise<TempoEstimate | null> {
  if (!file || file.size <= 0 || file.size > MAX_FILE_BYTES) {
    throw new LocalAudioAnalysisError('invalid-size', 'Choose a non-empty audio file no larger than 50 MB.');
  }

  let context: AudioContext | null = null;
  let encodedData: ArrayBuffer | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let channelData: Float32Array[] | null = null;
  let mono: Float32Array | null = null;
  let resampled: Float32Array | null = null;

  try {
    await readLocalAudioDuration(file);
    // decodeAudioData resamples to its context rate, keeping the temporary PCM buffer small.
    context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    encodedData = await file.arrayBuffer();
    audioBuffer = await context.decodeAudioData(encodedData);

    const duration = audioBuffer.duration;
    if (!Number.isFinite(duration) || duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
      throw new LocalAudioAnalysisError('invalid-duration', 'Audio must be at least 4 seconds and no longer than 5 minutes.');
    }
    if (!Number.isFinite(audioBuffer.sampleRate) || audioBuffer.sampleRate <= 0 || audioBuffer.numberOfChannels < 1) {
      throw new LocalAudioAnalysisError('decode-failed', 'The selected audio could not be decoded.');
    }
    if (audioBuffer.numberOfChannels > MAX_CHANNELS) {
      throw new LocalAudioAnalysisError('unsupported-channels', 'Choose a mono or stereo audio file.');
    }

    channelData = Array.from({ length: audioBuffer.numberOfChannels }, (_, channel) => audioBuffer!.getChannelData(channel));
    mono = new Float32Array(audioBuffer.length);
    for (const channel of channelData) {
      for (let i = 0; i < mono.length; i += 1) mono[i] += channel[i] / channelData.length;
    }

    const sampleRate = Math.min(TARGET_SAMPLE_RATE, audioBuffer.sampleRate);
    const outputLength = Math.floor(mono.length * sampleRate / audioBuffer.sampleRate);
    resampled = new Float32Array(outputLength);
    const ratio = audioBuffer.sampleRate / sampleRate;
    for (let i = 0; i < outputLength; i += 1) {
      const sourcePosition = i * ratio;
      const left = Math.floor(sourcePosition);
      const fraction = sourcePosition - left;
      const right = Math.min(left + 1, mono.length - 1);
      resampled[i] = mono[left] * (1 - fraction) + mono[right] * fraction;
    }

    const analysisSamples = resampled;
    encodedData = null;
    channelData = null;
    mono = null;
    audioBuffer = null;
    resampled = null;
    const decodingContext = context;
    context = null;
    if (decodingContext) {
      try {
        await decodingContext.close();
      } catch {
        // Continue with the temporary mono samples if close fails.
      }
    }
    return estimateBpm(analysisSamples, sampleRate);
  } catch (error) {
    if (error instanceof LocalAudioAnalysisError) throw error;
    throw new LocalAudioAnalysisError('decode-failed', 'The selected audio could not be decoded. Try another audio file.');
  } finally {
    encodedData = null;
    resampled = null;
    mono = null;
    channelData = null;
    audioBuffer = null;
    if (context) {
      try {
        await context.close();
      } catch {
        // Releasing references remains the priority if the browser cannot close the context.
      }
      context = null;
    }
  }
}

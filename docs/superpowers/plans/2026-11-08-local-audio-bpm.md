# Local Audio BPM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estimate tempo from audio the user selects locally, then cache only the accepted BPM under the current video's practice settings.

**Architecture:** A pure signal-analysis helper estimates tempo from a mono sample array. The renderer opens an explicit local audio file, decodes it with Web Audio in memory, calls the helper, and stores only the selected BPM through the existing per-video settings updater.

**Tech Stack:** Electron, React, TypeScript, Web Audio API, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-local-audio-bpm-design.md`

## Global Constraints

- Never download or separate YouTube audiovisual content; do not send local audio to a third-party service.
- Never persist the selected file, decoded samples, waveform, or temporary MP3.
- Cache only the accepted BPM in existing settings for the currently loaded video.
- Keep first-beat alignment manual.
- Accept mono/stereo files up to 50 MB and 4 seconds to 5 minutes; reject other files before changing BPM.

## Review Focus

- Silence, noise, very short signals, invalid sample rates, and decode errors must preserve existing BPM.
- Half/double-tempo ambiguity must be visible instead of silently applying a questionable value.
- Switching video while analysis is pending must not write BPM to the wrong video.
- Long audio is rejected from local metadata before decoding; decoded PCM is resampled to 11,025 Hz and multichannel files are rejected before creating analysis copies.
- Large files and decoder failures must release temporary buffers and present a recoverable message.
- No file bytes or source filename may appear in localStorage or network requests.

---

### Task 1: Pure tempo estimator

**Files:**
- Create: `src/renderer/lib/bpmDetection.ts`
- Create: `src/renderer/lib/bpmDetection.test.ts`

**Interface:** `estimateBpm(samples: Float32Array, sampleRate: number): TempoEstimate | null`, where `TempoEstimate` contains `{ bpm: number; confidence: number; alternatives: number[] }`.

- [x] Add failing synthetic-pulse tests for 40, 60, 90, 107, 120, 137, 180, and 220 BPM; add rejection tests for silence, noise, short input, and invalid inputs.
- [x] Implement the onset-envelope/autocorrelation estimator and expose nearby half/double candidates when confidence is ambiguous.
- [x] Run the focused estimator tests, then the full suite.

### Task 2: Local file selection and in-memory decoding

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/App.test.tsx`
- Modify: `src/renderer/ui/styles.css`

- [x] Add a file input triggered by “Определить BPM по файлу”; capture the video ID at analysis start.
- [x] Probe local duration before decoding; use a 11,025 Hz decode context, accept mono/stereo files up to 50 MB, downmix if needed, and release references/audio context in `finally`.
- [x] Apply a high-confidence BPM to the captured video only if it is still the active video; show a candidate chooser for ambiguous results.
- [x] Verify unsupported, silent, short, decode-failure, and video-switch paths leave settings unchanged.

### Task 3: Cache and release verification

**Files:**
- Modify: `README.md`
- Modify: `src/renderer/ui/App.test.tsx`

- [x] Confirm the selected BPM is persisted only through the existing per-video settings key; never persist file metadata or bytes.
- [x] Document local-only analysis and the still-manual first-beat alignment.
- [x] Run all tests, production build, and `git diff --check`; visually review the metronome card.

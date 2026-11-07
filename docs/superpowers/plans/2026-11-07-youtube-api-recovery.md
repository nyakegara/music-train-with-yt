# YouTube IFrame API Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover visibly when the YouTube IFrame API fails or stalls, while preserving the user's video and practice settings.

**Architecture:** A module-level loader owns one in-flight promise and the global YouTube ready callback. The React app subscribes with an unmount guard, shows loading/error status, and starts a fresh attempt from an explicit Retry button after a failure.

**Tech Stack:** Electron renderer, React, TypeScript, Vitest, jsdom, official YouTube IFrame API.

**Spec:** `docs/superpowers/specs/2026-11-07-youtube-api-recovery.md`

## Global Constraints

- Use only `https://www.youtube.com/iframe_api`; do not put an API key in the desktop app.
- Time out an API attempt after 15 seconds.
- A retry must preserve the pasted link and per-video practice settings.
- Do not change eligibility service behavior or the metronome/player features.

## Review Focus

- Existing `window.YT.Player`: resolve without inserting a script.
- Concurrent requests and React StrictMode: keep one active script and one callback owner.
- Script error and 15-second timeout: expose failure and let a retry create a new attempt.
- Late or duplicate callback: do not settle an old request twice or update an unmounted component.
- Previous callback: chain it and restore it only when the loader still owns the global slot.

---

### Task 1: Deduplicated IFrame API loader

**Files:**
- Create: `src/renderer/lib/youtubePlayerApi.ts`
- Test: `src/renderer/lib/youtubePlayerApi.test.ts`

**Interface:**
- Export `loadYouTubeIframeApi(): Promise<void>` and `YOUTUBE_API_TIMEOUT_MS` set to `15_000`.
- Resolve when `window.YT.Player` exists or when the current global ready callback fires.
- Reject on script error or timeout; remove the failed script and release the shared attempt so a later call can retry.

- [x] Write tests for already-ready API, concurrent calls sharing one script, script error followed by successful retry, timeout followed by successful retry, duplicate callbacks, and callback restoration.
- [x] Run `npm test -- src/renderer/lib/youtubePlayerApi.test.ts` and confirm the new cases fail before implementation.
- [x] Implement the shared promise loader with one callback owner, a 15-second timeout, and idempotent cleanup.
- [x] Run the focused tests and confirm all pass.
- [ ] Commit Task 1 as `feat: add retryable YouTube API loader`.

### Task 2: Visible loading, failure, and retry states

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/styles.css`
- Test: `src/renderer/ui/App.test.tsx`

- [ ] Add component tests for the loading status, visible alert after script error, explicit retry, timeout recovery, and preserving the link through retry.
- [ ] Run the focused component tests and confirm the failure/retry cases fail before implementation.
- [ ] Subscribe to `loadYouTubeIframeApi()` with an unmount guard; display Russian status text and a retry button in the existing inline error area.
- [ ] Run `npm test -- src/renderer/ui/App.test.tsx` and confirm all pass.

### Task 3: Final verification and review

- [ ] Run `npm test` and confirm all tests pass.
- [ ] Run `npm run build` and confirm the production build passes.
- [ ] Run `git diff --check`, request a read-only code review, address any concrete findings, and open an issue-linked PR for #25.

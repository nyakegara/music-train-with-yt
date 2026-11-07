# Beta Meter and Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable 3/4 and 4/4 metronome accents plus keyboard controls that are safe around inputs and video boundaries.

**Architecture:** Store `timeSignature: 3 | 4` in the existing per-video practice settings and use a pure beat-index helper for accents. Add a renderer keydown handler that delegates to current player actions, ignores editable controls, and offers a small shortcut dialog.

**Tech Stack:** Electron, TypeScript, React, Vitest, Testing Library, YouTube IFrame API.

**Spec:** `docs/superpowers/specs/2026-11-07-beta-meter-shortcuts-design.md`

## Global Constraints

- Use the official YouTube IFrame Player API; keep video playback inside its visible player.
- Store only local training settings per YouTube video ID.
- Restore metronome disabled after every app launch.
- Disable video-dependent controls until the player is ready.
- Add no runtime dependencies.

## Review Focus

- Old saved settings have no `timeSignature` and must load as 4/4 — test in Task 1.
- Corrupted local data can contain an unsupported meter — test in Task 1.
- A/B loop accent depends on selected meter and stays anchored to firstBeat — test in Task 1.
- Keyboard events originating in the URL field, sliders, or contenteditable must not trigger actions — test in Task 2.
- Space/arrows/A/B/M before player readiness must do nothing; arrows at both video ends clamp — test in Task 2.

---

### Task 1: Per-video meter and accented downbeats

**Files:**
- Modify: `src/renderer/lib/youtube.ts`
- Test: `src/renderer/lib/youtube.test.ts`
- Modify: `src/renderer/ui/App.tsx`
- Test: `src/renderer/ui/App.test.tsx`
- Modify: `src/renderer/ui/styles.css`

**Interfaces:**
- `PracticeSettings.timeSignature: 3 | 4`; default value is `4`.
- `isDownbeat(beatIndex: number, beatsPerBar: 3 | 4): boolean` returns true only for nonnegative indexes divisible by the meter.

- [x] **Step 1: Write failing storage and accent tests.** Assert default/backward-compatible meter is 4, persisted meter restores per video, invalid meter sanitizes to 4, and indexes 0/3/6 accent in 3/4 while 0/4/8 accent in 4/4.
- [x] **Step 2: Run `npm test -- src/renderer/lib/youtube.test.ts` and verify the new assertions fail for missing `timeSignature`/`isDownbeat`.**
- [x] **Step 3: Implement settings sanitation and `isDownbeat` in `youtube.ts`; use the helper in the oscillator frequency choice in `App.tsx`.**
- [x] **Step 4: Add accessible 3/4 and 4/4 controls in the metronome card, wire them to settings, and add a component test proving selection changes and persists.**
- [x] **Step 5: Run the focused tests, then `npm test` and `npm run build`; all pass.**
- [ ] **Step 6: Commit the completed meter feature.**

### Task 2: Focus-safe keyboard controls and shortcut help

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Test: `src/renderer/ui/App.test.tsx`
- Modify: `src/renderer/lib/youtube.ts`
- Test: `src/renderer/lib/youtube.test.ts`
- Modify: `src/renderer/ui/styles.css`

**Interfaces:**
- `clampPosition(position: number, duration: number): number` returns a finite position inside `0..duration`; with nonpositive duration it returns `0`.
- Shortcut map: Space play/pause; Left/Right seek 5 seconds; A/B set the corresponding loop boundary; M toggles metronome; `?` opens help; Escape closes help.

- [x] **Step 1: Write failing tests** for clamping below zero, above duration, and nonfinite position; component tests for every shortcut, no-op before player readiness, editable-focus suppression, and dialog open/close.
- [x] **Step 2: Run the focused tests and verify failures identify missing clamping/shortcut behavior.**
- [x] **Step 3: Implement `clampPosition` and use its result for both player seek and displayed current time.**
- [x] **Step 4: Add a single keydown effect that ignores editable targets, prevents page scrolling for Space, and invokes existing player operations only when ready.**
- [x] **Step 5: Add a small accessible keyboard-shortcuts dialog with a visible `?` trigger.**
- [x] **Step 6: Run `npm test` and `npm run build`; all pass.**
- [x] **Step 7: Request visual review and address findings.**

### Task 3: Beta integration

**Files:**
- Modify: `README.md`
- Verify: `.github/workflows/ci.yml`

- [x] **Step 1: Document meter selection, key bindings, and the fact that size is manual in README.**
- [x] **Step 2: Run `npm test`, `npm run build`, and `npm audit`; tests/build pass and audit reports zero vulnerabilities.**
- [ ] **Step 3: Verify clean diff, push branch, open PR linked to issue #10, and merge only after CI passes.**

# Practice Session Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a local, on-demand summary of the musician's current practice session.

**Architecture:** A pure in-memory tracker accumulates active play time, natural A/B returns, speed range, and the latest speed-trainer target. The renderer feeds it YouTube player state and existing loop-boundary decisions, then shows the snapshot in a small accessible dialog. Switching videos creates a fresh tracker; no report data is persisted.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-practice-session-report-design.md`

## Global Constraints

- Use local app events only; the report is not YouTube analytics.
- Do not persist report data; clear it on video change and app restart.
- Count an A/B repeat only when player state is PLAYING and the existing natural B-boundary predicate passes.
- Count active time only while player state is PLAYING, using monotonic `performance.now()` time.
- Track the latest speed target only; mark it reached only when the trainer changes playback to that target after a natural repeat.
- Resetting a report must not change player state, saved settings, or an active speed trainer.

## Review Focus

- Repeated polling at B must not add extra loops; manually seeking across B must not count.
- Buffering and paused spans must be excluded from active time, including multiple play/pause cycles.
- A paused speed change must not become the session's fastest played speed.
- Changing the speed target replaces the displayed target without preserving an attempt history.
- Reset during an active trainer clears counters while preserving the active target as not yet reached.

---

### Task 1: Pure session tracker

**Files:**
- Create: `src/renderer/lib/practiceSession.ts`
- Create: `src/renderer/lib/practiceSession.test.ts`

**Interfaces:**
- `PracticeSessionSnapshot`: `{ videoId: string; activeMilliseconds: number; completedLoops: number; startingSpeed: number | null; fastestSpeed: number | null; targetSpeed: number | null; targetReached: boolean }`.
- `PracticeSessionTracker(videoId: string)` exposes `startPlayback(nowMs, rate)`, `stopPlayback(nowMs)`, `recordPlaybackRate(rate)`, `recordLoop(naturalBoundary, rate)`, `setTarget(rate)`, `markTargetReached(rate)`, `snapshot(nowMs)`, and `reset(nowMs, currentRate, activeTarget)`.

- [x] Write failing tests for PLAYING time accumulation with pause/buffering gaps and a live snapshot while still playing.
- [x] Write failing tests proving only `naturalBoundary=true` while active counts one loop; false boundaries and repeated non-boundary polls do not.
- [x] Write failing tests for first-play starting speed, fastest active playback speed, latest target replacement, target reached, and reset during an active target.
- [x] Implement the tracker as an in-memory class with no browser or storage dependencies; `reset` keeps `activeTarget` and clears its reached state.
- [x] Run `npm test -- src/renderer/lib/practiceSession.test.ts --reporter=dot` and confirm the tests pass.

### Task 2: Player integration and report dialog

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/App.test.tsx`
- Modify: `src/renderer/ui/styles.css`
- Modify: `README.md`

**Consumes:** `PracticeSessionTracker` and `PracticeSessionSnapshot` from Task 1.

- [x] Add App tests showing play/pause/buffering updates active time, natural B-to-A returns increment the report once, and manual seeking does not.
- [x] Add App tests showing the latest speed-trainer target and reached state, reset during an active target, and report reset on video change.
- [x] Feed `onStateChange`, active playback rate changes, `isNaturalLoopBoundary`, speed-ladder start, and target completion into the current video's tracker.
- [x] Add an on-demand “Отчёт” button and dialog that shows completed loops, active time, starting/fastest speed, and latest target/reached state; Escape and close button must not pause video.
- [x] Add a reset action that clears only report metrics. Update visible active time at one-second intervals while the dialog is open.
- [x] Document the report's local-only, current-run scope in `README.md`.
- [x] Run the focused App tests, full `npm test -- --reporter=dot`, `npm run build`, and `git diff --check`; visually review the dialog in the desktop-sized app window.

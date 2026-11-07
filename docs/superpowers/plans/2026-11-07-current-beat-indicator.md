# Current Beat Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a visual beat cue that tracks the YouTube recording in the existing metronome card.

**Architecture:** Add a pure helper that maps recording position to a zero-based beat index using the scheduler's 20 ms tolerance. Render the index modulo the selected meter in the existing beat line; derive active state from the existing player, metronome, and position state.

**Tech Stack:** React, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-07-current-beat-indicator.md`

## Global Constraints

- Use actual player position and recording-time BPM; do not create an independent animation clock.
- Keep the line inactive while paused, buffering, unavailable, or with the metronome off.
- Do not change sound scheduling or saved settings.

## Review Focus

- Before the marked first beat: no marker is active.
- At beat boundaries and within 20 ms: visual beat matches the sound scheduler's tolerance.
- 3/4 and 4/4: render the correct number of markers and wrap the active beat within the bar.
- Pause, buffering, player error, and metronome off: every marker is dim.
- Seek or speed change: use the latest actual video position.
- Accessibility: concise label updates without a live announcement stream.

---

### Task 1: Calculate the active beat from recording position

**Files:**
- Modify: `src/renderer/lib/youtube.ts`
- Test: `src/renderer/lib/youtube.test.ts`

**Interface:**
- Add `beatIndexAt(time: number, firstBeat: number, bpm: number): number`.
- Return `-1` before the first beat; otherwise return the zero-based beat index. Use the same 20 ms tolerance as `nextBeatTime`.

- [x] Write tests for pre-first-beat, first beat, beat boundaries, 20 ms tolerance, and invalid BPM.
- [x] Run focused tests and confirm the new helper is missing.
- [x] Implement the helper and share the 20 ms tolerance constant with `nextBeatTime`.
- [x] Run focused unit tests.
- [x] Commit Task 1.

### Task 2: Render an accessible, live beat line

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/styles.css`
- Test: `src/renderer/ui/App.test.tsx`

- [ ] Add component tests for 3/4 and 4/4 marker counts, active downbeat and other beat, inactive states, and accessible labels.
- [ ] Run focused tests and confirm the active-beat expectations fail before implementation.
- [ ] Render meter-sized markers, highlight the active beat from `current`, `firstBeat`, and BPM, and dim them unless the player is ready, playing, and the metronome is enabled.
- [ ] Add minimal states for muted, active mint, and active amber markers; keep the existing layout and sizing.
- [ ] Run the focused component tests.
- [ ] Run full tests, production build, and `git diff --check`.
- [ ] Commit Task 2.

### Task 3: Review and PR

- [ ] Run the final full test suite through `task-done` and record the result.
- [ ] Request a read-only whole-branch review; fix Critical/Important findings and record any deferred minor.
- [ ] Open an issue-linked PR for #29.
- [ ] Merge after review and green CI.

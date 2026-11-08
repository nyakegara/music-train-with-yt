# First-Beat Fine Adjustment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add precise 10 ms first-beat adjustment controls and persist the offset per video.

**Architecture:** Add a pure helper that nudges a seconds value in 10 ms steps, rounds to milliseconds, and clamps it to the loaded video duration. Put accessible earlier/later buttons beside the existing playhead marker and display the resulting offset to millisecond precision through the current settings update path.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing CSS and localStorage settings helpers.

**Spec:** `docs/superpowers/specs/2026-11-08-first-beat-nudge-design.md`

## Global Constraints

- The nudge step is exactly 0.010 seconds; stored first-beat precision is milliseconds.
- `firstBeat` remains local and scoped to each video.
- Use the existing settings update path so the metronome reschedules from the new offset.
- Do not add network requests, dependencies, or YouTube metadata-derived metrics.

## Review Focus

- At `firstBeat = 2.000`, a later nudge must persist `2.010` and show `00:02.010`; test both the saved value and rendered timestamp.
- An earlier nudge at zero must remain zero and disable the earlier button; test the boundary.
- A later nudge at video duration must not exceed duration and disable the later button; test the boundary.
- Nudging must leave BPM, meter, speed, and A/B markers unchanged; assert those persisted values.
- A different video's saved settings must remain unchanged, and the controls must be unavailable before player readiness; test isolation and disabled state.

---

### Task 1: Add millisecond first-beat nudges

**Files:**
- Modify: `src/renderer/lib/youtube.ts`
- Test: `src/renderer/lib/youtube.test.ts`
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/styles.css`
- Test: `src/renderer/ui/App.test.tsx`

**Interfaces:**
- Consumes: current `settings.firstBeat`, `duration`, `playerReady`, shared `update`, and existing `saveSettings` effect.
- Produces: `adjustFirstBeat(firstBeat, delta, duration)` returning a millisecond-rounded offset clamped to `[0, duration]`; UI buttons labeled for earlier/later 10 ms adjustments and a `MM:SS.mmm` readout.

- [x] **Step 1: Write the failing helper test** for a 10 ms move from 2.000 to 2.010 seconds, reverse adjustment, and both duration boundaries.
- [x] **Step 2: Run the focused helper test and confirm it fails** because `adjustFirstBeat` is not implemented.
- [x] **Step 3: Implement `adjustFirstBeat(firstBeat: number, delta: number, duration: number): number`** in `youtube.ts`, rounding to milliseconds and clamping to the finite positive duration.
- [x] **Step 4: Run the helper test and confirm it passes.**
- [x] **Step 5: Write the failing UI test** for saving `2.010`, displaying `00:02.010`, reversing to `2.000`, preserving other practice fields, and isolating a second video's settings.
- [x] **Step 6: Run the focused UI test and confirm it fails** because the earlier/later controls do not exist.
- [x] **Step 7: Implement the accessible controls and precise timestamp** in `App.tsx`; keep the existing “mark current playhead” action and style a compact control group in `styles.css`.
- [x] **Step 8: Run the focused UI tests and full suite.** Expected: all existing and new tests pass.
- [x] **Step 9: Run `npm run build` and `git diff --check`.** Expected: production build succeeds and the diff is clean.
- [x] **Step 10: Commit** as `feat: fine tune first beat alignment`.

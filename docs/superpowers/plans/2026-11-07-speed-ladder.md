# Speed Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in trainer that steps through YouTube-supported playback speeds after each completed A/B pass until a chosen target is reached.

**Architecture:** Keep speed selection and loop validation in a pure helper. Store the armed target in volatile React state/ref, advance it at the existing guarded B-to-A loop transition, and keep controls inside the loop card.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library, YouTube IFrame Player API.

**Spec:** `docs/superpowers/specs/2026-11-07-speed-ladder-design.md`

## Global Constraints

- Use only rates returned by `getAvailablePlaybackRates()`.
- Do not persist an armed trainer or target.
- Keep existing player and loop behavior when the trainer is disabled.
- Do not autoplay or change speed except on an explicit start or completed pass.

## Review Focus

- Repeated polling at B must advance exactly once until the player returns below B — test one pass with repeated timer ticks.
- Seeking or editing loop markers must not leave a stale target armed — test disarm paths.
- A target must be a supported rate above the current one — test unavailable, equal, and lower targets.
- Invalid loop ranges and unknown duration must prevent arming — test boundary validation.
- Reaching the target must stop changing speed — test subsequent loop passes after completion.

---

### Task 1: Pure speed ladder rules

**Files:**
- Create: `src/renderer/lib/speedLadder.ts`
- Create: `src/renderer/lib/speedLadder.test.ts`

- [x] Write tests for valid/invalid loop inputs and the next supported rate before/at/after target.
- [x] Run the new tests and confirm the expected missing-module failure.
- [x] Implement the smallest pure helpers to pass the tests.
- [x] Re-run focused tests.

### Task 2: Connect the ladder to A/B playback

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/App.test.tsx`

- [x] Add integration tests for one speed step per B-to-A wrap, repeated polling guard, stop at target, and disarming on manual speed, loop edit, and video change.
- [x] Run the new tests and confirm failure before implementation.
- [x] Add volatile target state/ref and a guarded ramp-rate update path.
- [x] Re-run the focused integration tests.

### Task 3: Loop-card controls and full verification

- **Files:**
  - Modify: `src/renderer/ui/App.tsx`
  - Modify: `src/renderer/ui/styles.css`
  - Modify: `README.md`

- [x] Add target selection, arm/stop control, and concise live status; disable arming unless current speed, target, duration, and A/B are valid.
- [x] Document the opt-in behavior and temporary state in README.
- [x] Run all tests (174 passed), production build, and `git diff --check`.
- [x] Review the final UI states and verify that no playback rate changes while disarmed.

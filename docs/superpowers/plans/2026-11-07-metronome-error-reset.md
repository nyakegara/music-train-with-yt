# Metronome State After Player Error Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the metronome switch visibly off after the active YouTube player errors.

**Architecture:** Reset the existing `metronomeEnabled` setting in the current player's guarded `onError` callback. Preserve the player identity check so stale events cannot affect a newer session.

**Tech Stack:** React, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-07-metronome-error-reset.md`

## Global Constraints

- Change only current-player error state handling and its regression tests.
- Keep stale-player errors ignored.
- Do not change `localStorage` behavior or metronome scheduling.

## Review Focus

- Active player error: switch becomes unchecked and disabled; scheduled clicks stop.
- Stale player error: current session state remains unchanged and no error banner appears.

---

### Task 1: Clear the metronome UI state after active player errors

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Test: `src/renderer/ui/App.test.tsx`

- [x] Extend `stops metronome scheduling after the active player reports an error` to assert the switch is unchecked after error; extend the stale-player test to assert a replacement player's metronome remains checked after the old player errors.
- [x] Run the focused tests and confirm the active-player assertion fails because `aria-checked` remains true while the stale-player assertion passes.
- [x] In the existing `player.current === e.target` error path, call `update({ metronomeEnabled: false })`.
- [x] Run the focused test file and full test suite.
- [x] Run `npm run build` and `git diff --check`.
- [x] Commit the implementation and tests.
- [ ] Open an issue-linked PR for #26.

# Manual BPM Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct, validated BPM entry to the metronome controls and persist it per video.

**Architecture:** Keep a text draft in the renderer so users can replace a multi-digit value naturally. Commit only whole numbers from 40–240 through the existing settings update path; retain Tap Tempo and the step buttons.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing CSS and localStorage settings helpers.

**Spec:** `docs/superpowers/specs/2026-11-08-manual-bpm-entry-design.md`

## Global Constraints

- BPM remains an integer from 40 through 240.
- Save only through the existing per-video settings path.
- Keep `−`, `+`, TAP, local audio analysis, and first-beat offset behavior.
- Do not fetch YouTube or third-party metadata.

## Review Focus

- Typing a multi-digit value must not clamp partial input; test replacing 100 with 128 and committing with Enter.
- Blur must commit a valid value; test that the field's saved BPM changes.
- Empty, fractional, and out-of-range values must leave saved settings unchanged and show an accessible error.
- Switching videos must show that video's BPM, not a draft from the prior video.
- Updating BPM must preserve firstBeat; assert the saved settings retain its literal prior value.

---

### Task 1: Add the manual BPM field

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/styles.css`
- Test: `src/renderer/ui/App.test.tsx`

**Interfaces:**
- Consumes: existing `settings.bpm`, `update({bpm})`, and `saveSettings` effect.
- Produces: an input labeled `Темп BPM` that commits valid integer BPM on Enter or blur and rejects invalid values without changing persisted settings.

- [x] **Step 1: Write failing tests** for replacing the BPM with 128 and committing with Enter, committing on blur, rejecting empty/fractional/39/241 values accessibly, syncing to a different video's stored BPM, and preserving firstBeat.
- [x] **Step 2: Run the focused tests and confirm they fail** because the directly labeled BPM field does not exist yet.
- [x] **Step 3: Implement draft state and validation** in `App.tsx`; sync the draft after BPM or video changes; style the input and error message in `styles.css`.
- [x] **Step 4: Run the focused tests and full suite.** Expected: all tests pass; only valid commits update the saved BPM.
- [x] **Step 5: Run production build and diff checks.** Expected: TypeScript/Vite build succeeds and `git diff --check` is clean.
- [x] **Step 6: Commit** as `feat: allow direct bpm entry`.

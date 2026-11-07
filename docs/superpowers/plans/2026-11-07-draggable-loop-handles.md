# Draggable A/B Loop Handles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users refine an A/B practice loop by dragging the existing handles on the timeline.

**Architecture:** Add a pure conversion helper that maps pointer X and track geometry to bounded video seconds. Keep drag ownership and pointer capture in the loop timeline UI, and use the existing `loopStartAt` / `loopEndAt` helpers for the 0.1-second separation rule. The handles remain native buttons with click-to-set semantics.

**Tech Stack:** React, TypeScript, Vitest, Testing Library.

**Issue:** [#31](https://github.com/nyakegara/music-train-with-yt/issues/31)
**Spec:** `docs/superpowers/specs/2026-11-07-draggable-loop-handles.md`

## Global constraints

- Do not change YouTube playback or A/B loop scheduling.
- Keep click-to-set, the Current button, and A/B keyboard shortcuts.
- Preserve per-video settings persistence and native button semantics.
- Add no dependency.

## Review focus

- Mapping uses the loop track's `getBoundingClientRect()`, not the handle's box.
- The final click after pointer-up cannot replace the dragged value with the playhead.
- Pointer cancellation and lost capture cannot leave a stuck drag.
- A/B stay bounded and at least 0.1 seconds apart, including when one endpoint is unset.
- Hit area grows without changing visible handle geometry; names announce A/B and formatted position.

---

### Task 1: Convert pointer coordinates to recording time

**Files:**
- Modify: `src/renderer/lib/youtube.ts`
- Test: `src/renderer/lib/youtube.test.ts`

- [x] Add tests for start/middle/end mapping, clamping outside the track, and invalid width/duration/coordinates.
- [x] Run focused tests and confirm the new helper is missing.
- [x] Add the smallest pure helper returning `number | null` for invalid geometry.
- [x] Run focused unit tests.

### Task 2: Drag accessible A/B handles

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/styles.css`
- Test: `src/renderer/ui/App.test.tsx`

- [x] Add failing UI tests for dragging A and B, clamping the gap, persistence/readouts, release/cancel, and suppressing click-to-set after a drag.
- [x] Add pointer capture and movement handling using the timeline geometry and existing endpoint helpers.
- [x] Keep no-movement clicks, Current, and A/B shortcuts intact.
- [x] Add dynamic accessible names/titles, a larger transparent hit area, and touch behavior without enlarging the visible handle.
- [x] Run focused component tests.

### Task 3: Review and PR

- [ ] Run full test suite, production build, and `git diff --check`.
- [ ] Request a read-only code review; fix Critical/Important findings and record deferred minor findings.
- [ ] Open an issue-linked PR for #31 and merge after CI is green.

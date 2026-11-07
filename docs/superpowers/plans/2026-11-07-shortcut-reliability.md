# Keyboard Shortcut Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make practice shortcuts work predictably around focused controls and held keys.

**Architecture:** Keep the current single keydown handler, but separate editable-target suppression from native Space activation and suppress key-repeat toggles. Update the shortcut help copy to explain how to return focus from the YouTube iframe.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-07-shortcut-reliability-design.md`

## Global Constraints

- Keep the existing stack and add no runtime dependency.
- Preserve native Space activation on buttons and links.
- Keep keyboard shortcuts disabled in editable controls and sliders.
- Keep Left/Right key repeat enabled for seeking.

## Review Focus

- Holding Space or M must not repeatedly toggle playback/metronome; test repeated keydown events.
- A/B/M must work after normal mouse interaction leaves focus on a button; test from a focused meter/control button.
- Space on a button must not invoke the global play shortcut; test the event remains unprevented.
- Inputs and range sliders must continue to ignore global shortcuts; retain existing regression coverage.
- Help must direct users to click `?` after the YouTube iframe takes keyboard focus; assert the displayed copy.

---

### Task 1: Focus-safe, repeat-safe shortcut dispatch

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Test: `src/renderer/ui/App.test.tsx`

**Interfaces:**
- `isEditableTarget(target: EventTarget | null): boolean` identifies text/select/range editing targets and contenteditable elements.
- `isSpaceActivationTarget(target: EventTarget | null): boolean` identifies controls where Space has native activation behavior.

- [x] **Step 1: Write failing component tests.** Cover A/B/M with a focused button, Space remaining unprevented on a button, repeated Space/A/B/M being ignored, repeated arrows continuing to seek, and editable/range controls staying excluded.
- [x] **Step 2: Run `npm test -- --reporter=dot src/renderer/ui/App.test.tsx -t "focused|repeat|help copy"` and confirm the new assertions fail for the expected shortcut behavior.** New repeat/help assertions failed before implementation; focused-button checks also reproduced the existing target suppression.
- [x] **Step 3: Implement selective target handling and repeat suppression in the keydown effect.** Keep editable controls excluded; preserve native Space on buttons/links; allow app shortcuts from buttons; ignore repeat events except for Left/Right.
- [x] **Step 4: Replace the help note with an instruction to click the visible `?` button after clicking the YouTube player.**
- [x] **Step 5: Run focused tests, `npm test -- --reporter=dot`, `npm run build`, and `npm audit --audit-level=moderate`.** 44/44 tests pass; production build passes; npm audit reports 0 vulnerabilities.
- [ ] **Step 6: Request a read-only visual/code review, address findings, commit, push, and open a PR linked to the new issue. Merge only after CI passes.**

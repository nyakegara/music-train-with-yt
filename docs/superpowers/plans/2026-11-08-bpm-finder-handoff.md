# BPM Finder Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, user-controlled handoff from the metronome card to the suggested BPM Finder website.

**Architecture:** Add a pure external URL policy helper for the existing Electron `shell.openExternal` handler. Add an explanatory renderer link to the fixed tool path; the user pastes a video URL themselves and manually enters the BPM result into the existing field.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library, existing CSS.

**Spec:** `docs/superpowers/specs/2026-11-08-bpm-finder-handoff-design.md`

## Global Constraints

- Permit only `https://youtubetoolkit.com/tools/bpm-finder` (and its `www` hostname) as the new third-party destination.
- Do not include the current video URL, title, or ID in the destination.
- Do not scrape YouTube or the third-party page, or add a renderer network request.
- Keep existing YouTube external-link behavior unchanged.

## Review Focus

- A loaded-video link must point to the fixed URL without query data; assert href and visible explanation.
- HTTP and deceptive hostnames must be rejected; assert URL policy tests.
- HTTPS to a different path on the newly allowed hostname must be rejected; assert exact-path behavior.
- YouTube watch links must remain allowed; assert existing host behavior.
- The external link must use a new window and no referrer; assert its DOM attributes.

---

### Task 1: Add the BPM Finder handoff

**Files:**
- Create: `src/main/externalLinks.ts`
- Test: `src/main/externalLinks.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/styles.css`
- Test: `src/renderer/ui/App.test.tsx`

**Interfaces:**
- Consumes: Electron's existing `setWindowOpenHandler`, `shell.openExternal`, current `videoId`, and manual BPM entry.
- Produces: `isAllowedExternalUrl(url: string): boolean` and an accessible `Открыть BPM Finder` link with manual-transfer guidance.

- [x] **Step 1: Write failing policy tests** for the exact HTTPS tool path, existing YouTube hosts, HTTP, deceptive hostnames, and unrelated BPM Finder paths.
- [ ] **Step 2: Run the focused policy tests and confirm they fail** because the helper does not exist. Vite first failed to start its Windows helper process with `spawn EPERM`; after running verification with the permitted process context, the tests passed against the implementation. The red result could not be observed.
- [x] **Step 3: Implement `isAllowedExternalUrl`** and use it inside the existing Electron new-window handler.
- [x] **Step 4: Run the policy tests and confirm they pass.**
- [x] **Step 5: Write the failing renderer test** for the fixed BPM Finder URL, explanatory copy, no video ID in the href, `target="_blank"`, and `rel="noreferrer"`.
- [ ] **Step 6: Run the focused UI test and confirm it fails** because the link does not exist. The same initial Vite `spawn EPERM` prevented the red run; the focused test passed after implementation.
- [x] **Step 7: Add the link and concise guidance** next to the local BPM analysis in the metronome card.
- [x] **Step 8: Run focused tests and the full suite.** `npm test`: 286 tests passed across 11 files.
- [x] **Step 9: Run `npm run build` and `git diff --check`.** Renderer and Electron builds succeed; diff check is clean.
- [x] **Step 10: Commit** as `feat: add BPM finder handoff`.

## Verification Notes

- The live BPM Finder page accepts a pasted YouTube URL and searches video metadata; if it lacks an explicit tempo, it can return a genre estimate or offer tap tempo. The app copy describes this as a metadata-based estimate and asks users to verify it.
- The production renderer build contains the configured Cloudflare Worker URL.
- `npm run dist:win` ran the application build successfully but electron-builder failed before emitting a v0.1.3 installer after an external download returned `504 Gateway Time-out`. The existing v0.1.2 installer was left in place.

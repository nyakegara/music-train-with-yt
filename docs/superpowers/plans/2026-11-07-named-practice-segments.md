# Named Practice Segments Implementation Plan

> **For agentic workers:** Use the `superpowers:executing-plans` workflow task-by-task. Each step uses checkbox syntax.

**Goal:** Save, rename, select, and delete named A/B practice ranges independently for each video.

**Architecture:** Add a small validated local-storage API in `src/renderer/lib/youtube.ts` using the separate key `practice-segments:<videoId>`. Keep the active A/B settings in the existing settings object. Add an inline form and collapsed saved-segment list to the existing “Фрагмент” card in `App.tsx`; selecting a valid segment restores A/B and seeks to A.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, localStorage.

**Spec:** `docs/superpowers/specs/2026-11-07-named-practice-segments.md`

## Global Constraints

- Store only segment IDs, labels, and A/B timestamps locally; never cache YouTube metadata or media.
- Require `0 <= A < B <= known duration` before saving or selecting.
- Keep metronome opt-in after loading a saved segment; selecting must not autoplay.
- Existing per-video practice settings and last-video storage remain compatible.

## Review Focus

- Malformed or unavailable localStorage — return safe values and show save failure.
- Duplicate, empty, or overlong names — prevent save/rename and preserve existing rows.
- Video switch and remount — load the correct per-video list without cross-contamination.
- Stale segment beyond the actual video duration — disable selection and keep active settings unchanged.
- Selecting while playback/metronome is active — seek to A and let the existing loop/metronome scheduling respond to the seek.

## File Structure

- `src/renderer/lib/youtube.ts`: segment type, key, validation and load/save helpers.
- `src/renderer/lib/youtube.test.ts`: helper validation, per-video storage, malformed data and storage errors.
- `src/renderer/ui/App.tsx`: per-video segment state, save/rename/delete/select handlers, accessible inline forms and collapsed list.
- `src/renderer/ui/App.test.tsx`: integration coverage for persistence, selection, rename/delete and invalid ranges.
- `src/renderer/ui/styles.css`: focused card/list/form styles and visible keyboard focus.

### Task 1: Add the segment storage model

**Files:**
- Modify: `src/renderer/lib/youtube.ts`
- Test: `src/renderer/lib/youtube.test.ts`

**Interface:**
- `PracticeSegment = { id: string; label: string; loopA: number; loopB: number }`
- `loadPracticeSegments(videoId: string): PracticeSegment[]`
- `savePracticeSegments(videoId: string, segments: PracticeSegment[]): boolean`
- Invalid persisted entries are discarded; names are trimmed and limited to 40 characters; duplicate IDs/names are rejected case-insensitively.

- [x] Write tests first for independent video lists, valid round-trip, invalid records/duplicates, malformed JSON, invalid video IDs, and get/set exceptions.
- [x] Run `npm test -- src/renderer/lib/youtube.test.ts` and confirm the new tests fail because the API is absent.
- [x] Implement only the storage API needed by those tests.
- [x] Re-run the focused test and then the full suite.

### Task 2: Add named segments to the loop card

**Files:**
- Modify: `src/renderer/ui/App.tsx`
- Modify: `src/renderer/ui/styles.css`
- Test: `src/renderer/ui/App.test.tsx`

**Interface:**
- Load segment state when `videoId` changes.
- Saving is enabled only with a ready player, known duration, valid A/B, and a unique nonblank label.
- Selection updates active A/B and seeks to A; it never calls `playVideo`.
- Rename and delete update the per-video stored list. Storage failures leave the visible list unchanged and announce an accessible error.

- [x] Add failing integration tests for save/select/seek, per-video restore, rename/delete, invalid duration/range, and local-storage write failure.
- [x] Run the focused tests and confirm they fail for the missing controls.
- [x] Implement the compact inline save/rename flows and collapsed list.
- [x] Add keyboard focus and responsive styles without altering unrelated CSS.
- [x] Run the focused tests, full test suite, and production build.
- [x] Review the final diff for YouTube-policy-safe storage and clear accessibility labels.

---

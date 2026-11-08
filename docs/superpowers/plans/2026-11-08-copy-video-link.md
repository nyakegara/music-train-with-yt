# Copy Video Link Implementation Plan

**Goal:** Add a one-click, validated copy action for the current YouTube video URL.

**Architecture:** Expose a narrow `copyYouTubeUrl(videoId)` preload method. The main process validates the 11-character ID and writes only the canonical watch URL using Electron's clipboard API. The renderer uses the preload in Electron and the browser clipboard API in Vite preview, then announces success or failure.

**Tech Stack:** Electron IPC/preload, React, TypeScript, Vitest, Testing Library.

## Tasks

1. [x] Write tests for canonical YouTube URL construction and invalid IDs.
2. [x] Run focused helper tests; the missing helper failed as expected.
3. [x] Add the validated main-process clipboard handler and limited preload bridge.
4. [x] Write a UI test for the copy button, canonical ID, and accessible success/failure status.
5. [x] Run the UI test; it failed as expected because the copy button was absent.
6. [x] Add the button and status in the BPM Finder handoff row.
7. [x] Run focused regression tests, the full suite (300 passed), the production build, and `git diff --check`.
8. [x] Complete a read-only subagent review; no remaining findings. Commit as `feat: add one-click video link copy`.

## Constraints

- Copying happens only after the user's click.
- Opening BPM Finder never transfers the current video URL automatically.
- No clipboard read access is exposed to the renderer.

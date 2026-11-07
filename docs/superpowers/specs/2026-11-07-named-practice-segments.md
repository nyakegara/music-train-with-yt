# Named practice segments

## Goal

Save multiple named A/B ranges for one video, then recall any range to resume looping from its start.

## User experience

- The existing A/B markers remain the active loop. A full-width “Сохранить фрагмент” action appears in the “Фрагмент” card only when a player duration and valid A/B range exist.
- Saving opens a small inline label field with save and cancel actions. Labels are trimmed, 1–40 characters, and unique within that video's list (case-insensitive). Enter saves; Escape cancels.
- A collapsed “Сохранённые фрагменты · N” list sits below the current A/B controls. Each row selects a range, with always-visible rename and delete actions.
- Selecting a range restores its markers and seeks the player to A. It does not start playback or enable the metronome.
- Renaming preserves the range; deleting removes only that saved range. Resetting the current practice settings does not erase saved segments.
- Segment lists persist locally and independently by video ID. Store only user labels, stable IDs, and A/B timestamps; do not store YouTube titles, thumbnails, player data, or media.

## Data and safety

- Keep `PracticeSettings.loopA` and `loopB` as the active loop. Store named segments separately at `practice-segments:<videoId>`.
- A segment is `{ id, label, loopA, loopB }`. The ID is stable within the saved list.
- Reject malformed video IDs, JSON, records, blank/overlong labels, duplicate IDs or labels, and non-finite/negative/empty ranges. Never throw on local-storage errors; surface save failures in the UI.
- Saving or selecting requires `0 <= A < B <= known duration`. A list loaded before duration is known can still render, but a saved range outside the actual duration cannot be selected.

## Out of scope

- Cloud sync, automatic section detection, video metadata, exporting/importing, beat detection, and changing the active loop model.

## Acceptance

1. Save two differently named ranges for one video and retrieve them after switching away and back or remounting.
2. A different video has a separate empty/list state.
3. Selecting a saved segment updates A/B and seeks to A without autoplay.
4. Rename and delete work on one segment without changing its siblings or video settings.
5. Invalid ranges, duplicate or empty labels, unknown duration, malformed stored data, and local-storage failures are handled clearly and safely.

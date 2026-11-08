# First-Beat Fine Adjustment Design

## Intent

Let a musician align the metronome more precisely after marking the first beat at the playhead or entering a BPM from another tool. Small, reversible nudges make that calibration practical without changing the tempo.

## Goals

- Move the first-beat offset earlier or later by 10 ms per click.
- Show the saved first-beat position to millisecond precision.
- Save changes through the existing per-video settings update path.
- Recalculate metronome scheduling through the existing `firstBeat` update behavior.
- Prevent nudges below 0 or beyond the loaded video duration.

## Non-goals

- Automatically detect beat alignment from YouTube audio or metadata.
- Add a third-party BPM API, network request, or dependency.
- Change the persisted settings format or the BPM value.

## Approaches

1. Add earlier/later buttons in 10 ms steps. This is precise, reversible, keyboard accessible, and fits the existing metronome controls.
2. Add a drag slider for the offset. A slider makes a narrow 10 ms change difficult to target and takes more room in the compact metronome card.
3. Infer alignment from YouTube metadata or a remote service. This is not dependable for timing and would add an external dependency and policy risk.

Choose approach 1. The buttons adjust only the absolute `firstBeat` value, rounding to milliseconds and clamping it to the current video's duration.

## Constraints and decisions

- Keep the rough “Отметить первую долю” action, which sets `firstBeat` to the current playhead position.
- Add `−10 мс` and `+10 мс` controls beside it, disabled until the player and duration are ready and at the corresponding boundary.
- Display `firstBeat` as `MM:SS.mmm` so each adjustment is visible.
- Use the shared settings update path so metronome scheduling reacts to a change and per-video persistence continues to work.
- Do not transmit a video URL or derive BPM from YouTube API data.

## Acceptance

- At 128 BPM and `firstBeat = 2.000`, one later nudge stores `2.010` and displays `00:02.010`; an earlier nudge restores `2.000`.
- Nudging does not alter BPM, meter, loop markers, playback speed, or another video's settings.
- The earlier control cannot move before zero and the later control cannot move past video duration.
- Changing `firstBeat` while the metronome is active restarts scheduling from the new offset.

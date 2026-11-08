# Manual BPM Entry Design

## Intent

Let a user enter a known BPM directly in the metronome card, including a tempo they got from an external BPM Finder. The chosen tempo continues to use the existing per-video settings storage.

## Goals

- Enter a whole-number tempo from 40 through 240 BPM.
- Apply it with Enter or when the field loses focus.
- Keep the existing decrement, increment, and Tap Tempo controls.
- Save the applied BPM through the existing settings path for the current video.
- Reject empty and out-of-range values without changing the saved tempo.

## Non-goals

- Fetch BPM or metadata from YouTube or a third-party service.
- Estimate BPM from a genre or video title.
- Change local audio analysis, the metronome scheduler, or persisted settings format.

## Approaches

1. Keep only the existing `−`, `+`, and TAP controls. This cannot conveniently apply a BPM copied from another tool.
2. Update settings on every keystroke and clamp immediately. This makes replacing a multi-digit value awkward because partial input is clamped before typing finishes.
3. Use a draft numeric field and commit a valid value on Enter or blur. This supports natural editing and keeps invalid draft text out of saved settings.

Choose approach 3. The draft remains local to the control; `update({bpm})` persists only a valid integer in the existing 40–240 range.

## Constraints and decisions

- Keep the field in the current metronome BPM row.
- Give it the accessible name `Темп BPM` and show a concise validation message for an invalid commit.
- When another action changes BPM (Tap Tempo or `−/+`) or a different video loads, synchronize the draft to the current saved BPM.
- Preserve the current video's first-beat offset when BPM changes.
- Do not add a network request or dependency.

## Acceptance

- A user can replace the displayed tempo with a valid value and commit using Enter or blur.
- The setting is saved for that video, and a different video retains its own BPM.
- Empty, fractional, and out-of-range values do not alter the saved tempo and produce an accessible error.

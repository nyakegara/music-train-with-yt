# Metronome State After Player Error

**Issue:** [#26](https://github.com/nyakegara/music-train-with-yt/issues/26)

## Intent

When the active YouTube player errors, stop showing the metronome as enabled. The scheduler already stops and local storage already records the toggle as disabled; this change aligns the visible React state with that behavior.

## Approaches

1. Reset `metronomeEnabled` to `false` in the active player's error handler. This reuses the existing switch and persistence behavior and is selected.
2. Keep the enabled preference and add a separate inactive/error presentation. This adds UI state for a setting that is already persisted as disabled and is not actionable while the player is unavailable.

## Behavior

- Only the current player error resets the metronome setting.
- Errors from an old player remain ignored and do not change the new session's switch.
- Do not change player error messaging, saved-setting semantics, or metronome scheduling.

## Acceptance

- After enabling the metronome and reporting an error from the current player, the switch is unchecked and disabled, and no further clicks are scheduled.
- An error from a stale player leaves the current player's metronome setting unchanged.

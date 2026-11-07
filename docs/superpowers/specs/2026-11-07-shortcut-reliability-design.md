# Reliable keyboard shortcuts

## Intent

Make the advertised shortcuts dependable during practice without stealing native button behavior or repeating toggle actions when a key is held.

## Goals

- A/B/M and seek shortcuts keep working when focus remains on an app button after a click.
- Space toggles playback from the app surface, while Space on buttons and links keeps its native meaning.
- Holding Space, A, B, or M does not repeatedly toggle playback, move a loop marker, or flip the metronome. Holding Left/Right may continue seeking.
- Inputs, textareas, selects, contenteditable elements, and range controls continue to own their keyboard input.
- Help explains that focus must return from the YouTube iframe by clicking the visible `?` button.

## Non-goals

- Custom shortcut remapping or configurable keyboard layouts.
- Changing the current action map or YouTube player lifecycle.
- Preventing repeated arrow seeks.

## Constraints

- Keep the existing Electron, React, TypeScript, and Vitest stack; add no dependency.
- Preserve native Space activation on buttons and links.
- Keep shortcuts disabled for editable controls and sliders.

## Approaches

1. **Require background focus and document it.** Smallest change, but A/B/M would still stop working after normal button interaction.
2. **Run all shortcuts regardless of focus.** Simple, but overrides Space activation on focused buttons.
3. **Use selective dispatch (chosen).** Ignore editable targets, let native Space activation work on interactive controls, allow letter/seek shortcuts from app buttons, and ignore repeated non-seek keys. This matches the existing app-wide help while preserving expected control behavior.

## Design

Split the current target filter into editable-target detection and Space activation detection. Process dialog Escape/Tab first. Outside the dialog, return for editable targets; for Space, return only when the active target is an interactive button/link/switch; ignore `event.repeat` except for Left/Right. Keep the current readiness guard and action code. Replace the help note with an instruction to click the visible `?` control after using the YouTube iframe.

## Acceptance

- A/B/M work when a button has focus and a video is ready.
- Space on a focused button is not consumed by the global player shortcut; Space elsewhere still toggles playback.
- Repeated Space/A/B/M do not invoke repeated actions; repeated Left/Right continue seeking.
- Editable controls remain excluded, and the help note gives an action the user can perform after the iframe takes focus.

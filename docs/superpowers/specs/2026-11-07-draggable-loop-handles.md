# Draggable A/B Loop Handles

**Issue:** [#31](https://github.com/nyakegara/music-train-with-yt/issues/31)

## Intent

Let musicians fine-tune a practice segment directly on the timeline instead of repeatedly seeking and setting A/B at the playhead.

## Selected approach

Keep the existing A/B buttons and their click-to-set behavior. Add pointer dragging to those handles, mapping the pointer's horizontal position over the loop track to recording time. Reuse the existing `loopStartAt` and `loopEndAt` bounds so A/B retain at least 0.1 seconds of separation and stay within the recording. Place A above the track and B below it, with a thin connector to each exact timeline position, so their drag targets remain distinguishable even when the endpoints are close.

Alternative: make the whole track a click-to-seek surface. This changes an existing interaction and is unnecessary for precise handle editing, so it is not selected.

## Behavior

- Pointer-down on A or B begins a drag and captures the pointer so movement continues if it leaves the handle.
- Convert the pointer's client X coordinate to a recording position from the loop track's bounding rectangle; clamp positions to `[0, duration]`.
- Update the selected endpoint during dragging through `loopStartAt` or `loopEndAt`, preserving `0 ≤ A < B ≤ duration` and the existing 0.1-second gap. If duration or track width is invalid, do nothing.
- Update the selected range, handle position, readout, and per-video saved settings as the endpoint moves.
- Pointer-up, pointer-cancel, and lost pointer capture end the drag. A drag must not dispatch the button's click-to-set action on release.
- A click without movement still sets A/B at the playhead. The Current button and A/B keyboard shortcuts keep working.
- Keep native button semantics and keyboard focus. Give each handle a dynamic accessible label and title with its role and formatted value. Expand the hit target outward in its own vertical lane and use `touch-action: none`.
- Loop playback continues to use the latest endpoints while a handle is moving. The polling timer must not restart on every drag update.

## Acceptance

- Dragging A and B maps pointer X to recording seconds and updates the saved settings and readouts.
- Dragging A past B or B before A clamps to the nearest valid 0.1-second gap; positions beyond either end clamp to video bounds.
- Releasing outside the handle and pointer cancellation clear drag state; releasing after a drag does not snap the handle back to the playhead.
- Click-to-set, the Current button, keyboard A/B shortcuts, and loop playback remain functional.
- Handles remain keyboard-focusable and have accessible names that include A/B and the formatted position.
- When A/B are nearly adjacent, both handles remain independently draggable without moving their visual X away from the represented time.
- Unknown duration, invalid track width, and out-of-bounds pointer coordinates are safe.

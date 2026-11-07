# Current Beat Indicator

**Issue:** [#29](https://github.com/nyakegara/music-train-with-yt/issues/29)

## Intent

Make the existing beat line useful during practice by showing which beat of the measure the YouTube recording is currently on.

## Approaches

1. Derive the active beat from the current video position, BPM, first-beat anchor, and time signature. This uses the same recording-time model as the metronome and is selected.
2. Animate the line from an independent timer. That can drift after seeking, buffering, and speed changes, so it is not selected.
3. Add a separate beat display and controls. This adds UI weight without adding information beyond the existing line.

## Behavior

- Show three or four beat markers according to the selected 3/4 or 4/4 meter.
- Highlight the beat containing the current video position. Use amber for the active downbeat and mint for other active beats; keep every inactive marker muted.
- Derive position from the actual player time, BPM, and marked first beat. Keep the first-beat anchor strict so no marker lights before it; apply the shared 20 ms tolerance only at later beat boundaries.
- Dim all markers when the player is paused, buffering, unavailable, or the metronome is off.
- Expose the beat as a concise accessible image label with live announcements disabled.
- Do not add controls, change audio scheduling, or persist new settings.

## Acceptance

- Seeking and playback-rate changes update the visual beat from actual video position, including when the requested seek and the position later reported by YouTube differ.
- The number and accessible label of markers match the selected meter.
- 3/4 and 4/4 both wrap the active marker to the downbeat.
- The indicator is inactive when playback is not actively running or the metronome is off.
- Player error and inactive styling leave every marker dim.

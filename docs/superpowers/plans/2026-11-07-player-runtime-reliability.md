# Player Runtime Reliability Plan

**Goal:** Keep the displayed practice state in sync with the YouTube player when settings reset or playback fails.

**Issues:** [#18](https://github.com/nyakegara/music-train-with-yt/issues/18), [#19](https://github.com/nyakegara/music-train-with-yt/issues/19)

## Scope

- Reset the active YouTube playback rate to the default speed.
- Ensure a reset made before `onReady` is respected when the player initializes.
- Stop playback and metronome scheduling after an error from the current player, without responding to errors from stale players.
- Preserve the user's metronome preference when a player fails; resume only after playback starts again.

## Test-first steps

1. [x] Add a component test that loads a saved 0.5× speed, readies the player, resets settings, and confirms the actual player receives 1×.
2. [x] Add a component test that resets while the player is still loading and confirms `onReady` applies 1× instead of the stale saved speed.
3. [x] Add a component test that starts playback and the metronome, triggers `onError` on the active player, and confirms the scheduled click is cancelled, no further clicks are created, and controls become unavailable. Keep the existing stale-player error test.
4. [x] Run each new test against the old implementation and confirm it fails for the target regression. All three new tests failed before implementation.
5. [x] Implement the smallest state synchronization and error cleanup changes.
6. [x] Run the focused component tests, all tests, production build, and `git diff --check`. The focused tests pass; the full suite passes 91/91; production build and diff check pass.
7. [ ] Request a read-only code review, address findings, commit and push the issue-linked PR, and merge after CI and review pass.

## Review focus

- `onReady` reads the latest selected speed, not a stale render closure.
- Reset updates both saved settings and the live player.
- Current-player errors cancel a pending future oscillator and stop the metronome interval.
- Stale-player events continue to have no effect.

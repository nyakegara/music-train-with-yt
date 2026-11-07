# YouTube IFrame API Recovery Design

**Issue:** [#25](https://github.com/nyakegara/music-train-with-yt/issues/25)

## Goal

When the YouTube IFrame API fails or stalls, tell the user what happened and let them retry without losing the submitted video link or its practice settings.

## Current behavior

The app appends `https://www.youtube.com/iframe_api` and waits indefinitely for the global `onYouTubeIframeAPIReady` callback. It does not handle script errors, stalled requests, or retries. Its callback also remains attached after the component unmounts.

## Approaches

1. Add error and timeout handlers inside the React effect. This is small, but makes duplicate script loading and global callback cleanup difficult under React StrictMode.
2. Add a shared, deduplicated promise loader with an error handler and timeout. The app subscribes to the promise, ignores completion after unmount, and retries after rejection. This is the chosen approach because it owns the global callback in one place and can be tested without the YouTube network.
3. Add a third-party loader package. It adds a dependency for a small lifecycle that the existing app can own directly, so it is not selected.

## Behavior

- Reuse `window.YT.Player` immediately when it is already available.
- Allow only one active script load; call concurrent requests through the same promise.
- Wait up to 15 seconds for the API callback. On script error or timeout, resolve if `window.YT.Player` is already available; otherwise reject, remove the failed script, restore the previous global callback if still owned, and allow a later retry.
- Chain a pre-existing `onYouTubeIframeAPIReady` callback and never overwrite a newer owner during cleanup.
- Ignore a component's promise completion after unmount.
- After video eligibility succeeds, show `Подключаю плеер YouTube…` as a status while loading. On failure, show `Не удалось подключить плеер YouTube. Проверь подключение и попробуй ещё раз.` with a `Повторить` button and `role="alert"`.
- Retry keeps the URL and per-video practice settings. It reloads the player API, not the eligibility check.

## Non-goals

- Change video eligibility or YouTube account requirements.
- Add an API key to the desktop app.
- Change player, loop, metronome, or saved-setting behavior after the API loads.

# Windows Alpha Release Plan

**Goal:** Publish the tested Windows x64 Music Train 0.1.0 installer as a GitHub prerelease.

**Issue:** [#3](https://github.com/nyakegara/music-train-with-yt/issues/3)

## Release prerequisites

- [x] Deploy the public eligibility Worker and verify it with a real YouTube API request.
- [x] Build the current `0.1.0` NSIS installer with the production Worker URL.
- [x] Install the generated installer into an isolated workspace folder; confirm the app starts, then uninstall and remove the test folder.
- [x] Document the alpha limits, release tag process, and unsigned installer notice.

## Steps

1. [x] Add a tag-triggered Windows workflow that validates the tag before dependency installation, does not persist the checkout token, runs tests, builds the installer, and publishes it as a GitHub prerelease. A first tag run showed electron-builder v26 also tries to publish implicitly; `dist:win` now explicitly sets `--publish never` so the release action remains the only publisher.
2. [ ] Merge the release-build fix after CI passes, retarget the existing unpublished `v0.1.0` tag to the merged commit to rerun the workflow, and verify the release asset and notes. The first run failed before creating a release.
3. [ ] Close issue #3 after the published installer is confirmed.

## Verification evidence

- Local installer: `release/Music Train Setup 0.1.0.exe` (123,625,778 bytes).
- Packaged `app.asar` contains `https://music-train-eligibility.musictrain.workers.dev`.
- Silent install and uninstall both exited with code 0; installed `Music Train.exe` stayed running for eight seconds.
- Worker smoke test returned HTTP 200 and `{ "eligible": true }`.
- The installer has no Authenticode signature; the prerelease notes state that Windows may display an unknown-publisher warning.

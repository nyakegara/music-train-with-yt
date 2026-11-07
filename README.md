# Music Train with YT

Windows desktop practice tool. Paste a YouTube link, slow the video, mark a passage to repeat, and practice along with a metronome.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

## Test and build

```powershell
npm test
npm run build
$env:VITE_ELIGIBILITY_API = "https://your-worker.example.workers.dev"
npm run dist:win
```

The NSIS installer is written to `release/`. `npm run dist:win` rejects a missing or insecure Worker URL, so the released app won't silently ship without video eligibility checks. The YouTube embedded player requires internet access. Development mode permits direct embed testing without the Worker. See [`worker/README.md`](worker/README.md) for deployment.

## Publish a Windows alpha

Push a `vX.Y.Z` tag that matches the version in `package.json`. The Windows release workflow runs the tests, builds the x64 NSIS installer with the production eligibility Worker, and publishes the installer as a GitHub prerelease for `0.x` and hyphenated versions. For example, after merging the release changes, tag the `0.1.2` release commit with `v0.1.2`. The installer is unsigned; Windows may show an unknown publisher warning.

Published installers are listed under [GitHub Releases](https://github.com/nyakegara/music-train-with-yt/releases).

## Current scope

The app stores BPM, first beat, metronome volume, playback speed, meter, and loop markers locally per video. Named practice segments can save multiple A/B ranges per video; their labels and timestamps stay on this computer. The metronome always opens switched off so it starts only after an explicit user action. Automatic beat detection and automatic tab transcription are tracked for future versions in the GitHub issues.

### Speed trainer

Open **Тренажёр скорости** in the loop card, choose a supported target above the current speed, then start the trainer. Each completed A/B repeat advances by one playback rate reported by YouTube and stops at the target. The trainer is temporary: changing the loop, video, playback speed, or seeking with the app controls stops it.

### Meter and keyboard controls

Choose **3/4** or **4/4** in the metronome card. The first beat of each bar gets the stronger click. The meter is manual; the app does not detect a song's meter automatically. Existing saved videos default to 4/4.

| Key | Action |
| --- | --- |
| Space | Play or pause |
| ← / → | Seek 5 seconds |
| A / B | Set loop start or end at the current position |
| M | Toggle the metronome |
| ? | Open shortcut help |
| Esc | Close shortcut help |

Video controls require a ready player. Shortcuts are ignored in text fields and sliders. YouTube's iframe can take keyboard focus; if shortcuts stop responding after clicking the video, click the app's **?** control to return focus.

### Eligibility service

The production Worker is deployed at `https://music-train-eligibility.musictrain.workers.dev`. It needs a YouTube Data API key stored as the `YOUTUBE_API_KEY` Cloudflare secret before it can approve videos. From the `worker/` directory, set it with `npx wrangler secret put YOUTUBE_API_KEY`; enter the key in the Wrangler prompt and never commit it to the repository. Until the secret is configured, the Worker returns `503 service_unavailable` and the app asks the user to retry.


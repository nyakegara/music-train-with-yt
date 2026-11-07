# Music Train with YT

Windows desktop practice tool. Paste a YouTube link, slow the video, mark a passage to repeat, and practice along with a metronome.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

## Test and build

```sh
npm test
npm run build
npm run dist:win
```

The NSIS installer is written to `release/`. The YouTube embedded player requires internet access. Release builds require `VITE_ELIGIBILITY_API` so videos are checked before embedding. Development mode permits direct embed testing without the Worker. See [`worker/README.md`](worker/README.md) for deployment.

## Current scope

The first version stores BPM, first beat, playback speed, loop markers, and metronome settings locally per video. Automatic beat detection and automatic tab transcription are tracked for future versions in the GitHub issues.


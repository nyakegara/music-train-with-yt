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

## Current scope

The first version stores BPM, first beat, metronome volume, playback speed, and loop markers locally per video. The metronome always opens switched off so it starts only after an explicit user action. Automatic beat detection and automatic tab transcription are tracked for future versions in the GitHub issues.


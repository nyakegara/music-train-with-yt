# BPM Finder Handoff Design

## Intent

Make the BPM Finder suggested by the user easy to open from the metronome card, while keeping the app's known BPM entry and local audio analysis as the ways to apply or verify a tempo.

## Goals

- Show an `Открыть BPM Finder` link when a YouTube video is loaded.
- Open the exact HTTPS tool page in the user's default browser through Electron's existing external-link handler.
- Explain that the external service estimates tempo from video metadata; the user transfers the result into the BPM field manually.
- Permit only the exact BPM Finder route on `youtubetoolkit.com` through the external-link allowlist.

## Non-goals

- Do not send the current video URL to the third-party site automatically.
- Do not scrape the site's page or derive BPM from YouTube API metadata.
- Do not download video/audio or change local waveform analysis.

## Approaches

1. Scrape the third-party page or build an automated BPM lookup. This has no documented API in the supplied material, is brittle, and would automate a metadata-derived metric.
2. Add an explicit handoff link and keep result entry manual. This is discoverable and transparent, and keeps the user in control of what they paste into the external service.
3. Leave the site entirely disconnected. This avoids code but makes the user's suggested workflow harder to find.

Choose approach 2. The handoff opens only the fixed tool page; the app does not include a video ID or title in the destination URL.

## Constraints and decisions

- Use `target="_blank"` and Electron's existing `shell.openExternal` path.
- Extend the host allowlist only for the exact HTTPS BPM Finder route; keep arbitrary paths and schemes blocked.
- Keep the explanation adjacent to the link and BPM field so users know to enter the result manually.
- Do not add dependencies or network calls from the renderer.

## Acceptance

- With a loaded video, the metronome card exposes a link to `https://youtubetoolkit.com/tools/bpm-finder` and explains that the result must be entered manually.
- The destination contains no video URL or ID.
- The external handler allows HTTPS to the exact BPM Finder path, while rejecting HTTP, unrelated paths, deceptive subdomains, and unsupported protocols.

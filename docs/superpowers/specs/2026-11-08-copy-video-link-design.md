# Copy Video Link Design

## Intent

Remove the extra selection step from the manual BPM Finder workflow. The user can copy a clean YouTube URL for the currently loaded video, open the external tool, and paste the URL there.

## Goals

- Add a `Скопировать ссылку` control alongside the BPM Finder link.
- Copy only the canonical `https://www.youtube.com/watch?v={id}` URL for the loaded video.
- Use a narrow preload method backed by Electron's clipboard API; provide the browser clipboard API for local web preview.
- Show an accessible success or failure status.

## Non-goals

- Do not put the video URL into the BPM Finder link or submit it automatically.
- Do not read the user's clipboard.
- Do not scrape metadata, download audio, or analyze a YouTube stream.

## Constraints

- Validate the video ID in the main process before writing to the clipboard.
- The renderer must not receive general clipboard access; expose only `copyYouTubeUrl(videoId)` through preload.
- Normalize away playlists, timestamps, and tracking parameters.

## Acceptance

- With a loaded video, the button writes exactly `https://www.youtube.com/watch?v={11-char-id}` to the clipboard and announces success.
- Invalid IDs are rejected and no clipboard value is written.
- If copying fails, the UI explains that the user can copy the address from the video field.
- The BPM Finder link remains fixed and contains no video ID.

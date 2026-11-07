# Eligibility service error contract

## Intent

When YouTube temporarily throttles the eligibility service or is unavailable, people should know when to retry. Quota exhaustion and API configuration failures should not look like a broken internet connection. The app must keep the pasted link available for manual retry and must never expose upstream error bodies or the API key.

## Approaches

1. **Keep the generic client message and only fix Worker status codes.** Smallest patch, but the app would still hide the useful distinction from users.
2. **Return normalized Worker error codes and a bounded `Retry-After`, then show matching Russian guidance in the app.** Chosen because it carries enough information for a useful message without introducing background requests.
3. **Add automatic retries and a countdown UI.** Rejected for this change because repeated requests can consume YouTube quota and add state to the video load flow.

## Contract

All Worker error bodies have `{ error: string, retryable: boolean }`. They contain no upstream response text.

- The app's IP limiter returns HTTP 429, `rate_limited`, `retryable: true`, and `Retry-After: 60`.
- YouTube HTTP 429 returns HTTP 503, `upstream_rate_limited`, `retryable: true`.
- YouTube HTTP 400/403 rate-limit reasons (`userRateLimitExceeded`, `rateLimitExceeded`, `servingLimitExceeded`) also return HTTP 503, `upstream_rate_limited`, `retryable: true`.
- YouTube HTTP 5xx, fetch failures, timeouts, and malformed success JSON return HTTP 503, `upstream_unavailable`, `retryable: true`.
- YouTube 403 daily quota reasons (`quotaExceeded`, `dailyLimitExceeded`) return HTTP 503, `quota_exceeded`, `retryable: false`.
- Other YouTube 403 responses return HTTP 503, `youtube_api_forbidden`, `retryable: false`.
- Missing Worker API-key configuration returns HTTP 503, `service_unavailable`, `retryable: false`.
- A failure in Cloudflare's rate-limit service returns HTTP 503, `service_unavailable`, `retryable: true`, and the default `Retry-After`.
- Other upstream rejections return a sanitized non-retryable error.
- Retryable upstream responses normalize `Retry-After` seconds or HTTP-date to a delta in the inclusive range 1–3600 seconds. Missing or invalid values use 30 seconds. `Retry-After` is exposed through CORS; preflight advertises the same expose header.
- The renderer reads the error code and retry delay. Temporary errors show a manual retry time; quota/configuration errors say the service needs time or configuration attention. Network failures without an HTTP response keep the existing connection message.
- The renderer uses `retryable` to distinguish missing API-key configuration from a temporary internal limiter failure that shares the `service_unavailable` code.

## Goals and boundaries

- Keep the eligibility route, YouTube API key storage, and 6-second upstream timeout unchanged.
- Keep retries user initiated; preserve the pasted link after a failed eligibility check.
- Add no runtime dependencies, background polling, or automatic retry loops.
- Cover upstream statuses, malformed responses, CORS exposure, rate limiting, and user-visible error copy with tests.

## Constraints

- Worker error payloads stay sanitized and never include API keys or upstream error messages.
- Retry delay shown to the user comes from the normalized response header and remains bounded.
- Existing success and ineligible-video payloads remain unchanged.

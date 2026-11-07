# Eligibility Worker

Deploy with Cloudflare Wrangler. Create a Google Cloud project with YouTube Data API v3 enabled, then add the key as a Worker secret:

```sh
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler deploy
```

The endpoint `GET /v1/videos/{id}/eligibility` checks video existence, public or unlisted visibility, Made for Kids status, and whether embedding is enabled. The API key remains in the Worker secret store. Configure a Google Cloud API key restriction to YouTube Data API v3 and monitor quota usage in Cloud Console.

The Worker allows 60 eligibility checks per client IP per minute in each Cloudflare location. Cloudflare's built-in limit is approximate and may be exceeded briefly while its regional counters update. The namespace ID must be unique within the Cloudflare account.

## Error responses

Worker errors use a sanitized JSON body with `error` and `retryable` fields. They never include the upstream response body. `Retry-After` is returned in seconds and is exposed through `Access-Control-Expose-Headers` for the desktop app.

| HTTP status | Error | Retryable | Retry behavior |
| --- | --- | --- | --- |
| 429 | `rate_limited` | Yes | Retry after 60 seconds. |
| 503 | `upstream_rate_limited` | Yes | Covers YouTube HTTP 429 and 403 rate-limit reasons; retry after YouTube's delay, bounded to 1–3600 seconds; defaults to 30 seconds. |
| 503 | `upstream_unavailable` | Yes | Retry after YouTube's delay, bounded to 1–3600 seconds; defaults to 30 seconds. |
| 503 | `quota_exceeded` | No | YouTube API quota is exhausted; wait for quota recovery. |
| 503 | `youtube_api_forbidden` | No | Check the Worker API key and its YouTube Data API restriction; YouTube reports `keyInvalid`/`keyExpired` as HTTP 400 and other authorization failures as HTTP 403. |
| 503 | `service_unavailable` | Depends on `retryable` | A missing API key is non-retryable; a Cloudflare rate-limiter failure is retryable after 30 seconds. |
| 502 | `upstream_rejected` | No | The upstream rejected an unexpected request. |

YouTube per-user and short-window rate-limit reasons (`userRateLimitExceeded`, `rateLimitExceeded`, and `servingLimitExceeded`) are transient; they are not classified as daily quota exhaustion. YouTube may report `rateLimitExceeded` with HTTP 400 or 403, and the Worker normalizes either response.

Reason codes and statuses follow [YouTube Data API global error definitions](https://developers.google.com/youtube/data/reference/rest/v3/core_errors).

`Retry-After` accepts either delta-seconds or an HTTP date from YouTube. The Worker normalizes it to an integer between 1 and 3600 seconds. Clients should not retry automatically; they can use the returned code and delay to guide a manual retry.

# Eligibility Error Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users clear, accurate retry guidance when the eligibility Worker fails.

**Architecture:** Normalize upstream and local limiter failures into safe Worker error codes with a bounded `Retry-After` header exposed by CORS. The renderer translates those codes into Russian guidance while preserving the entered link for a manual retry.

**Tech Stack:** Cloudflare Workers, TypeScript, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-eligibility-error-contract.md`

## Global Constraints

- Do not expose the YouTube API key or upstream response bodies.
- Preserve the eligibility route, success/ineligible response shape, and 6-second upstream timeout.
- Do not add automatic retries, polling, or a runtime dependency.
- Normalize upstream retry delays to integer seconds between 1 and 3600; missing/invalid values default to 30.

## Review Focus

- Upstream `429` versus `5xx`: distinct retryable codes, sanitized bodies, and the correct delay.
- Daily quota `403`, temporary rate-limit `400/403`, and invalid-key `400/403`: distinct retryability and messages.
- Upstream HTTP-date, missing, invalid, zero, and oversized `Retry-After` values.
- Local limiter response: preserve HTTP `429` and provide a 60-second retry delay.
- Cross-origin clients: `Retry-After` is readable on errors and the preflight response advertises it.
- Network rejection and malformed success JSON shape: show a temporary service error rather than treating an invalid video as ineligible.
- Renderer response JSON parse failure: retain the existing connection fallback and keep the pasted link for manual retry.

---

### Task 1: Normalize Worker failures

**Files:**
- Modify: `worker/src/index.ts`
- Test: `worker/src/index.test.ts`
- Modify: `worker/README.md`

**Interfaces:**
- `json(body: unknown, status?: number, extraHeaders?: HeadersInit): Response` merges consistent JSON/CORS headers with per-response headers.
- A private `retryAfterSeconds(value: string | null, now?: number): number` parses delta-seconds or HTTP-date, clamps to 1–3600, and returns 30 for missing/invalid values.
- Retryable errors use `{ error: 'rate_limited' | 'upstream_rate_limited' | 'upstream_unavailable', retryable: true }`.
- `service_unavailable` can be retryable when the Cloudflare limiter fails, or non-retryable when the API key is missing; the `retryable` boolean disambiguates them.
- Other non-retryable errors use `{ error: 'quota_exceeded' | 'youtube_api_forbidden' | 'upstream_rejected', retryable: false }`.

- [x] **Step 1: Add failing Worker tests.** Assert YouTube 429 and its temporary rate-limit 400/403 reasons map to sanitized HTTP 503 `upstream_rate_limited`; YouTube 5xx maps to HTTP 503 `upstream_unavailable`; daily quota, HTTP 400 invalid/expired API keys, and other 403 responses stay distinct and non-retryable; local limit returns HTTP 429 with `Retry-After: 60`; limiter failure returns retryable `service_unavailable`; missing key returns non-retryable `service_unavailable`; preflight and JSON responses expose `Retry-After`; network rejection, malformed JSON syntax, and malformed success shapes are retryable service errors.
- [x] **Step 2: Run `npm test -- --reporter=dot worker/src/index.test.ts` and confirm the new expectations fail on the current implementation.** Baseline tests first failed on 12 new expectations; focused checks later confirmed limiter/configuration semantics, lenient date parsing, malformed success-shape handling, and HTTP 400 API-key classification.
- [x] **Step 3: Implement retry normalization and error mapping in `worker/src/index.ts`.** Accept only valid delta-seconds or canonical HTTP-date, clamp to 1–3600 seconds, and default invalid/missing values to 30; use 60 seconds for the local limiter; classify rate-limit and API-key error reasons on their documented HTTP statuses; treat malformed success shapes as temporary upstream errors; expose `Retry-After` through CORS and do not return upstream text.
- [x] **Step 4: Document response codes, retry semantics, and CORS visibility in `worker/README.md`.**
- [x] **Step 5: Run the Worker test file and verify every new error response is sanitized.** 35 Worker tests pass.

### Task 2: Show actionable eligibility errors

**Files:**
- Modify: `src/renderer/lib/youtube.ts`
- Test: `src/renderer/lib/youtube.test.ts`
- Modify: `src/renderer/ui/App.tsx`
- Test: `src/renderer/ui/App.test.tsx`

**Interfaces:**
- `eligibilityErrorMessage(errorCode: string | undefined, retryAfter: string | null, retryable?: boolean): string` maps Worker codes to safe Russian guidance and formats bounded delay seconds.
- `loadVideo` consumes JSON error codes and the exposed `Retry-After` header, but does not retry automatically or clear the URL field.

- [x] **Step 1: Add failing helper tests.** Check distinct copy for `rate_limited`, `upstream_rate_limited`, `upstream_unavailable`, `quota_exceeded`, and `youtube_api_forbidden`; distinguish retryable from configuration `service_unavailable`; verify delays below a minute and in whole minutes, ignore invalid delay values, and retain the generic fallback for unknown codes.
- [x] **Step 2: Add failing component tests.** Stub the eligibility service to return a retryable 503 with `Retry-After`; assert the delay appears in the alert, the video link remains in the input, and a second click issues a second manual request. Also assert quota errors show non-retryable guidance and do not display an immediate delay.
- [x] **Step 3: Run the new helper and component tests and confirm they fail before implementation.** The renderer agent reported 13 targeted failures before the helper and response handling were added; the non-retryable configuration case also failed before its assertion was implemented.
- [x] **Step 4: Implement `eligibilityErrorMessage` and use it for non-OK Worker responses.** Keep network/invalid-JSON exceptions on the existing connection fallback; read Worker JSON defensively and keep the retry manual.
- [x] **Step 5: Run `npm test -- --reporter=dot`, `npm run build`, and `npm audit --audit-level=moderate`.** 84/84 tests pass; build passes; audit reports zero vulnerabilities.
- [ ] **Step 6: Run a read-only code/UX review, address findings, commit, push, open a PR linked to issue #14, and merge only when review and CI pass.**

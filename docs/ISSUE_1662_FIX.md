# Issue #1662 Fix: Error Response Propagation

## Problem

`setChargeLevelTarget` returns 400 from GM's EV API. The error response body was silently dropped because `RequestError.response` only had `{ data }` — no HTTP `status`/`statusText`. onstar2mqtt's `normalizeError()` checks `e.response?.status` which was undefined, so it fell through to a degraded error format.

## Fix (PR #644)

### src/types.ts

- Added `status?: number` and `statusText?: string` to `RequestResponse` interface

### src/RequestService.ts (4 hunks)

1. **sendRequest() axios path** — now stores `{ status, statusText, data }` instead of just `{ data }`
2. **sendRequest() non-axios path** — stores status alongside data (was merging into data)
3. **shouldFallbackToV1()** — checks `response?.status === 400` before body field checks
4. **isEVAuthError()** — reads `resp.status` directly instead of `data.status`

### Tests added

- 3 tests in RequestError.test.ts (status storage, success path, runtime access)
- 2 tests in RequestService.test.ts (shouldFallbackToV1 with HTTP status)
- 22 regression tests from real GitHub issue log patterns (#1662, #1457, #418, #333, #667, #1529, #1438, #1401, #419, #246)
- Total: 197 tests pass, 5 suites

## What was NOT changed

- No console.error logging added (fires on expected v3→v1 fallback and EV auth retry)
- No changes to RequestError.ts itself
- No changes to public API surface
- Root cause of #1662 (why GM rejects the request) still unknown — needs EV vehicle to reproduce

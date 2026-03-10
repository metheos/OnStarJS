# OnStarJS Error Handling Architecture

## Error Flow: OnStarJS → onstar2mqtt

- `sendRequest()` catches axios/non-axios errors → wraps in `RequestError` with `.setResponse()` / `.setRequest()`
- `RequestError` extends `Error`, has `private response` — but `private` compiles away, so `err.response` is accessible at runtime
- `RequestResponse` interface (internal, NOT exported in `src/index.ts`): `{ status?, statusText?, data? }`
- onstar2mqtt's `normalizeError()` checks `e.response?.status` and `e.response?.data` at runtime

## Key Error Paths in sendRequest()

1. **Axios error with response** → `{ status, statusText, data }` from `error.response`
2. **Non-axios error with response** → same shape from `(error as any).response`
3. **Axios error without response** → "No response", request only
4. **Generic Error** → message only, no response/request

## Decision Points That Read Error Status

- `shouldFallbackToV1()` — checks `response?.status === 400` first, then `data?.status` / `data?.statusCode`, then error message strings
- `isEVAuthError()` — checks `resp.status` for 401/403, then message regex for auth keywords, then 400+expired local token
- 429 retry loop — checks `error.response?.status === 429` directly on axios error (before wrapping)

## GM API Error Response Patterns (from real GitHub issues)

| Endpoint                                 | Status | Body Pattern                                                                 |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `na-mobile-api.gm.com` healthstatus      | 403    | empty `""`                                                                   |
| `na-mobile-api.gm.com` v1 API (disabled) | 404    | empty `""`, statusText="api has been disabled"                               |
| `na-mobile-api.gm.com/veh/cmd/v3/`       | 400    | structured `{"error":"Bad Request","path":"...","status":400}`               |
| `eve-vcn.ext.gm.com` EV commands         | 400    | sometimes empty `""`, sometimes `{"error":459,"message":"Not supported..."}` |
| OAuth `/api/v1/oauth/token`              | 400    | `{"error":"invalid_client"}`                                                 |
| GM server issues                         | 504    | empty or truncated                                                           |
| Command failure (200 OK)                 | 200    | full `commandResponse` with ONS-xxx codes                                    |

## Important: GM body is almost always empty for HTTP errors

The `data` field is typically `""` for 400/403/404. The HTTP status/statusText are the primary diagnostic signals.

## Key Files

- `src/RequestService.ts` — core: all OnStar/GM API requests, error handling, retries, EV commands
- `src/types.ts` — `RequestResponse`, `CommandResponseStatus`, `HttpClient` (RequestResponse is internal, not exported)
- `src/RequestError.ts` — extends Error, stores response/request (private but runtime-accessible)
- `src/RequestResult.ts` — success wrapper, stores response/request
- `src/auth/GMAuth.ts` — browser-based OAuth/TOTP auth (uses raw axios errors, not RequestError)

## API Endpoints

- `na-mobile-api.gm.com` — main GM API (v1 legacy + v3 new)
- `eve-vcn.ext.gm.com` — EV-specific commands (charging, metrics)
- Action commands use v3 with automatic v1 fallback (cached per session)

## Downstream Consumer

- BigThunderSR/onstar2mqtt and homeassistant-addons-onstar2mqtt
- `normalizeError()` in error-utils.js reads `e.response?.status`, `e.response?.data`, `e.request`, `e.message`, `e.stack`
- No status-code-specific branching in normalizeError — pure serializer

## Issue Sources

- Addon issues: BigThunderSR/homeassistant-addons-onstar2mqtt
- Standalone issues: BigThunderSR/onstar2mqtt

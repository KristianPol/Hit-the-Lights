# Rate Limit Increase & CSP Fix Design

## Overview
Increase backend rate limits to support multiple users sharing the same IP address, and fix GitHub avatar images blocked by Helmet CSP on the About page.

## Changes

### 1. Rate Limiting (`src/backend/database/server.ts`)

| Limiter | Routes | Current | New |
|---------|--------|---------|-----|
| Global | All | 200 req / 15 min | **5,000 req / 15 min** |
| Auth | `/api/auth/login`, `/api/auth/register` | 10 req / 15 min | **50 req / 15 min** |
| Song Upload | `POST /api/songs/add` | — | **50 req / 15 min** |

The new song-upload limiter will be applied directly to `POST /api/songs/add` in `src/backend/database/server.ts` (after the global limiter).

### 2. Helmet CSP (`src/backend/database/server.ts`)

Update the `imgSrc` directive to whitelist GitHub avatar origins:

```typescript
imgSrc: [
  "'self'",
  "data:",
  "blob:",
  "https://github.com",
  "https://avatars.githubusercontent.com",
  ...(r2CspOrigin ? [r2CspOrigin] : [])
],
```

This allows the three GitHub avatar images on the About page (`src/frontend/about/about.html`) to load. GitHub redirects `github.com/<user>.png` requests to `avatars.githubusercontent.com`, so both origins must be included.

## Files Modified

- `src/backend/database/server.ts` — rate limits, helmet CSP

## No New Dependencies

`express-rate-limit` and `helmet` are already installed.

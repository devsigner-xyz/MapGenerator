# Backend-First Nostr Overlay Notes

## Why this refactor

The overlay moved read-heavy Nostr flows behind the BFF to reduce browser noise and make behavior more deterministic for portfolio demos.

Before this change, the browser executed multiple direct relay and NIP-05 network reads, producing noisy console output and harder-to-debug failure modes.

After this change, the frontend uses `/v1/*` endpoints for identity and social read APIs, while the backend centralizes relay fallback, request dedupe, and in-memory caching.

## What moved to the BFF

- NIP-05 batch verification via `POST /v1/identity/nip05/verify-batch`
- Profile batch resolve via `POST /v1/identity/profiles/resolve`
- Graph reads:
  - `GET /v1/graph/follows`
  - `GET /v1/graph/followers`
- Content reads:
  - `GET /v1/content/posts`
  - `GET /v1/content/profile-stats`

## Caching and dedupe model

- In-memory TTL caches only (no Redis)
- Inflight request dedupe for repeated keys
- Relay fallback stays backend-side
- Conservative route-level rate limits for portfolio usage

## Privacy and crypto boundaries

The privacy boundary is intentionally preserved:

- Client-side signing remains in the frontend
- DM encrypt/decrypt remains in the frontend
- BFF handles read orchestration and normalized DTO responses

This keeps sensitive key material and crypto operations on the client while reducing runtime noise from read paths.

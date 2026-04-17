# Backend-First Nostr Noise Reduction (Portfolio) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce browser console noise by moving external Nostr/network read paths from frontend to backend, while preserving privacy and keeping the solution simple (in-memory cache, no Redis).

**Architecture:** Frontend talks to BFF (`/v1/*`) for identity and social read APIs. Backend centralizes external requests, relay fallbacks, caching, and request dedupe. Sensitive cryptographic operations (sign/encrypt/decrypt) stay client-side.

**Tech Stack:** React + TanStack Query + TypeScript (frontend), Fastify + nostr-tools + TypeScript (backend), in-memory TTL caches.

---

## Chunk 1: Quick Wins (Contract Alignment and 400 Errors)

**Files:**
- Modify: `src/nostr-api/dm-api-service.ts`
- Modify: `src/nostr-api/social-notifications-api-service.ts`
- Create: `src/nostr-api/api-limits.ts`
- Validate (no behavior expansion): `server/src/modules/dm/dm.schemas.ts`
- Validate (no behavior expansion): `server/src/modules/notifications/notifications.schemas.ts`
- Test: `src/nostr-api/dm-api-service.test.ts`
- Test: `server/src/modules/dm/dm.routes.test.ts`
- Test: `server/src/modules/notifications/notifications.routes.test.ts`

- [ ] **Step 1: Add shared frontend API limits constants**
  - Create `src/nostr-api/api-limits.ts` with max values matching backend schemas.
  - Include at least: `API_MAX_LIMIT = 100`.

- [ ] **Step 2: Clamp frontend DM limit to backend max**
  - Update request builders in `src/nostr-api/dm-api-service.ts` to clamp outgoing `limit` to `API_MAX_LIMIT`.

- [ ] **Step 3: Clamp frontend notifications limit to backend max**
  - Update request builder in `src/nostr-api/social-notifications-api-service.ts` to clamp `limit` to `API_MAX_LIMIT`.

- [ ] **Step 4: Add/adjust unit tests for clamping behavior**
  - Add tests that input `limit > 100` and assert outgoing request uses `100`.

- [ ] **Step 5: Run targeted tests**
  - Run: `pnpm test:unit:frontend -- --runInBand`
  - Run: `pnpm test:unit:backend -- --runInBand`

- [ ] **Step 6: Commit chunk**
  - Suggested message: `fix: align frontend pagination limits with bff schemas`

---

## Chunk 2: Backend Identity Module (NIP-05 + Profile Resolve Batch)

**Files:**
- Create: `server/src/modules/identity/identity.schemas.ts`
- Create: `server/src/modules/identity/identity.service.ts`
- Create: `server/src/modules/identity/identity.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/modules/identity/identity.service.test.ts`
- Test: `server/src/modules/identity/identity.routes.test.ts`

- [ ] **Step 1: Define request/response schemas and DTOs**
  - Add schemas for `POST /identity/nip05/verify-batch` and `POST /identity/profiles/resolve`.
  - Enforce input bounds (batch size, string lengths, pubkey format).

- [ ] **Step 2: Implement identity service with in-memory cache + inflight dedupe**
  - NIP-05 verification: timeout + success/error TTL + dedupe per key.
  - Profile resolve: batch lookup and normalized response map.

- [ ] **Step 3: Implement identity routes**
  - Wire schemas, call service, return stable DTOs.
  - Apply `preHandler: app.verifyOwnerAuth` to owner-scoped endpoints.

- [ ] **Step 4: Register identity routes in app**
  - Update `server/src/app.ts` with `app.register(identityRoutes, { prefix: '/v1' })`.

- [ ] **Step 5: Add backend tests**
  - Service tests for cache hit/miss, timeout, and dedupe.
  - Route tests for 200/400/401/403 expected behavior.

- [ ] **Step 6: Run backend tests**
  - Run: `pnpm test:unit:backend -- --runInBand`

- [ ] **Step 7: Commit chunk**
  - Suggested message: `feat: add identity bff module for nip05 and profile batch resolution`

---

## Chunk 3: Frontend Migration to Identity API

**Files:**
- Create: `src/nostr-api/identity-api-service.ts`
- Modify: `src/nostr-overlay/query/nip05.query.ts`
- Modify: `src/nostr-overlay/hooks/useNip05Verification.ts`
- Modify: `src/nostr/nip05.ts`
- Optional test: `src/nostr-api/http-client.test.ts`

- [ ] **Step 1: Create identity API client**
  - Implement typed methods for `verifyNip05Batch` and `resolveProfiles` using `createHttpClient`.

- [ ] **Step 2: Switch NIP-05 query flow to backend endpoint**
  - Replace direct fetch path in `nip05.query.ts` with batch API call.
  - Preserve existing return shape consumed by UI.

- [ ] **Step 3: Keep `nip05.ts` as pure parser/formatter utility**
  - Remove external network behavior from frontend NIP-05 helper.
  - Keep parse/display helpers used by UI.

- [ ] **Step 4: Add tests for query mapping and batch behavior**
  - Validate mapping from backend DTO to existing `Nip05ValidationResult` shape.

- [ ] **Step 5: Run frontend tests**
  - Run: `pnpm test:unit:frontend -- --runInBand`

- [ ] **Step 6: Commit chunk**
  - Suggested message: `refactor: route nip05 verification through bff identity api`

---

## Chunk 4: Backend Graph + Content Read Modules

**Files:**
- Create: `server/src/modules/graph/graph.schemas.ts`
- Create: `server/src/modules/graph/graph.service.ts`
- Create: `server/src/modules/graph/graph.routes.ts`
- Create: `server/src/modules/content/content.schemas.ts`
- Create: `server/src/modules/content/content.service.ts`
- Create: `server/src/modules/content/content.routes.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/modules/graph/graph.service.test.ts`
- Test: `server/src/modules/graph/graph.routes.test.ts`
- Test: `server/src/modules/content/content.service.test.ts`
- Test: `server/src/modules/content/content.routes.test.ts`

- [ ] **Step 1: Define graph/content DTOs and schemas**
  - Endpoints:
    - `GET /graph/follows`
    - `GET /graph/followers`
    - `GET /content/posts`
    - `GET /content/profile-stats`

- [ ] **Step 2: Implement services with relay fallback + cache**
  - Reuse existing relay gateway patterns.
  - Add short TTL and inflight dedupe keyed by normalized query params.

- [ ] **Step 3: Implement routes and register in app**
  - Add route handlers and register in `server/src/app.ts`.

- [ ] **Step 4: Add backend tests**
  - Happy paths + validation errors + empty data behavior.
  - Ensure stable sort/pagination behavior where relevant.

- [ ] **Step 5: Run backend tests**
  - Run: `pnpm test:unit:backend -- --runInBand`

- [ ] **Step 6: Commit chunk**
  - Suggested message: `feat: add graph and content bff read endpoints`

---

## Chunk 5: Frontend Migration to Graph/Content API

**Files:**
- Create: `src/nostr-api/graph-api-service.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts` (service injection typing)
- Validate unchanged privacy boundaries: `src/nostr-overlay/hooks/useNostrOverlay.ts`

- [ ] **Step 1: Create graph/content API service client**
  - Methods for follows/followers/posts/profile-stats.

- [ ] **Step 2: Inject backend-backed services into overlay flow**
  - Wire API service in `useNostrOverlay` where direct relay read functions are currently used.

- [ ] **Step 3: Keep cryptographic operations in frontend only**
  - Confirm DM sign/encrypt/decrypt still use client-side write gateway.

- [ ] **Step 4: Add/adjust tests for overlay data loading path**
  - Focus on service wiring and shape compatibility.

- [ ] **Step 5: Run frontend tests**
  - Run: `pnpm test:unit:frontend -- --runInBand`

- [ ] **Step 6: Commit chunk**
  - Suggested message: `refactor: migrate social read paths to bff graph/content apis`

---

## Chunk 6: Portfolio Polish (Stability, Error UX, Documentation)

**Files:**
- Modify: `src/nostr-api/http-client.ts`
- Modify: `server/src/plugins/rate-limit.ts`
- Create: `docs/portfolio-backend-first.md`
- Optional modify: `README.md`

- [ ] **Step 1: Tighten client error handling for backend responses**
  - Ensure UI-facing errors are structured and actionable, with minimal console spam.

- [ ] **Step 2: Add route-level rate-limit config for new endpoints**
  - Apply conservative defaults suitable for local/portfolio usage.

- [ ] **Step 3: Document architecture and privacy decisions**
  - Add before/after explanation and which flows remain client-crypto.

- [ ] **Step 4: Full validation run**
  - Run: `pnpm test:unit`
  - Run (optional for demo): `pnpm test:smoke`

- [ ] **Step 5: Commit chunk**
  - Suggested message: `docs: add backend-first architecture notes for portfolio`

---

## Acceptance Criteria

- [ ] Browser no longer performs direct NIP-05 cross-origin requests for migrated flows.
- [ ] 400 errors caused by limit mismatch are eliminated.
- [ ] Social read paths consume BFF APIs instead of direct relay queries (for migrated features).
- [ ] Client-side key handling and DM cryptographic privacy boundaries are preserved.
- [ ] Unit tests pass for frontend and backend.

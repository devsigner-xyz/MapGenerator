# Relay Health Modal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-relay detail from `Settings > Relays` with an on-demand modal and metrics for status, latency, last error, last seen, and session events received.

**Architecture:** Add a `relay-health` domain service to probe one relay with short timeout and a session-memory store to accumulate `sessionEventsReceived` per normalized URL. Integrate this into `MapSettingsModal` with compact status badges and a dedicated `RelayDetailModal` that supports manual refresh. Do not add polling or persistence.

**Tech Stack:** React 19, TypeScript, Vitest, JSDOM, existing Nostr stack (`@nostr-dev-kit/ndk`).

**Runtime Assumptions:** Tests run in Vitest + JSDOM with mocked `globalThis.WebSocket` and fake timers. Test runs must not require live relay network access.

**Metric Scope (MVP):** `sessionEventsReceived` means probe-observed events in the current browser session for each relay. Future instrumentation may expand this to all NDK traffic without changing modal API.

---

## File Structure

- Create: `src/nostr/relay-health-session.ts`
- Create: `src/nostr/relay-health-session.test.ts`
- Create: `src/nostr/relay-health.ts`
- Create: `src/nostr/relay-health.test.ts`
- Create: `src/nostr-overlay/components/RelayDetailModal.tsx`
- Modify: `src/nostr-overlay/components/MapSettingsModal.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Modify: `src/nostr-overlay/App.test.tsx`

## Chunk 1: Domain + Session Metrics

### Task 1: Create session store by relay

**Files:**
- Create: `src/nostr/relay-health-session.ts`
- Test: `src/nostr/relay-health-session.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test('initializes empty stats for unknown relay', () => {
  // expect defaults
})

test('increments sessionEventsReceived and updates lastSeenAt', () => {
  // expect counter and timestamp update
})

test('stores lastError while preserving counters', () => {
  // expect error update only
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm vitest run src/nostr/relay-health-session.test.ts`
Expected: FAIL because module/functions do not exist yet.

- [ ] **Step 3: Implement minimal store**

```ts
export interface RelaySessionStats {
  sessionEventsReceived: number
  lastSeenAt?: number
  lastError?: string
}

export function getRelaySessionStats(relayUrl: string): RelaySessionStats
export function recordRelayEvents(relayUrl: string, count: number, seenAt?: number): RelaySessionStats
export function recordRelayError(relayUrl: string, error: string): RelaySessionStats
export function resetRelayHealthSessionForTests(): void
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/nostr/relay-health-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr/relay-health-session.ts src/nostr/relay-health-session.test.ts
git commit -m "feat: add relay session metrics store"
```

### Task 2: Create relay-health probe service

**Files:**
- Create: `src/nostr/relay-health.ts`
- Test: `src/nostr/relay-health.test.ts`
- Reuse: `src/nostr/relay-policy.ts`

- [ ] **Step 1: Write failing tests**

```ts
test('relay health: returns disconnected for invalid relay url', async () => {
  // invalid URL handling
})

test('relay health: returns disconnected on timeout', async () => {
  // timeout branch
})

test('relay health: returns connected with latency and updates session stats', async () => {
  // successful probe
})
```

- [ ] **Step 2: Add deterministic WebSocket mock harness**

Add a helper in `src/nostr/relay-health.test.ts` that replaces `globalThis.WebSocket` with controlled open/error/close behavior.

- [ ] **Step 3: Add fake timers for timeout/latency assertions**

Use Vitest fake timers to control timeout and probe latency paths.

- [ ] **Step 4: Run test to verify failure**

Run: `pnpm vitest run src/nostr/relay-health.test.ts`
Expected: FAIL because probe service is not implemented.

- [ ] **Step 5: Implement minimal probe service**

```ts
export type RelayConnectionStatus = 'unknown' | 'connected' | 'degraded' | 'disconnected'

export interface RelayHealthSnapshot {
  relayUrl: string
  status: RelayConnectionStatus
  latencyMs?: number
  lastError?: string
  lastSeenAt?: number
  sessionEventsReceived: number
  measuredAt: number
}

export async function probeRelayHealth(
  relayUrl: string,
  options?: { timeoutMs?: number; degradedLatencyMs?: number }
): Promise<RelayHealthSnapshot>
```

Implementation notes:
- Normalize relay URL before probing.
- Default timeout 4000ms.
- `connected` when WebSocket opens in time.
- `degraded` when open succeeds but latency exceeds threshold.
- `disconnected` on timeout/error/early close.
- Merge output with session stats from `relay-health-session`.

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm vitest run src/nostr/relay-health.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/nostr/relay-health.ts src/nostr/relay-health.test.ts
git commit -m "feat: add relay health probing service"
```

## Chunk 2: UI Integration (Settings + Relay Detail Modal)

### Task 3: Add `RelayDetailModal` component

**Files:**
- Create: `src/nostr-overlay/components/RelayDetailModal.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Test: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing UI tests first**

Add exact test names in `src/nostr-overlay/App.test.tsx`:
- `test('relay status: opens detail modal', ...)`
- `test('relay status: renders metric placeholders', ...)`

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "relay status: opens detail modal|relay status: renders metric placeholders"`
Expected: FAIL because button/modal do not exist yet.

- [ ] **Step 3: Implement modal skeleton only**

Create `RelayDetailModal.tsx` with title, relay URL, close button, and static metric labels.

- [ ] **Step 4: Wire loading/refreshing/error display state**

Add props and rendering branches for `loading`, `refreshing`, and `error` while preserving previous snapshot values.

- [ ] **Step 5: Wire metric value formatting**

Render normalized values for `estado`, `latencia`, `ultimo error`, `ultimo visto`, and `eventos recibidos (sesion)`.

- [ ] **Step 6: Add styles**

Add classes in `styles.css` for metric grid/cards and status badge variants (`connected`, `degraded`, `disconnected`, `unknown`) aligned with existing modal style.

- [ ] **Step 7: Run focused tests to verify pass**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "relay status: opens detail modal|relay status: renders metric placeholders"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/nostr-overlay/components/RelayDetailModal.tsx src/nostr-overlay/styles.css src/nostr-overlay/App.test.tsx
git commit -m "feat: add relay detail modal with health metrics"
```

### Task 4: Integrate status summary and manual refresh in relay list

**Files:**
- Modify: `src/nostr-overlay/components/MapSettingsModal.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Add failing tests**

Add exact test names:
- `test('relay status: row shows action button', ...)`
- `test('relay status: opening modal runs initial probe', ...)`
- `test('relay status: manual refresh re-probes and updates measuredAt', ...)`
- `test('relay status: stale probe result is ignored after relay switch', ...)`

- [ ] **Step 2: Run focused tests to verify failure**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "relay status: row shows action button|relay status: opening modal runs initial probe|relay status: manual refresh re-probes and updates measuredAt|relay status: stale probe result is ignored after relay switch"`
Expected: FAIL.

- [ ] **Step 3: Add local state for relay snapshots and selection**

Add state:
- `selectedRelayUrl`
- `relaySnapshotsByUrl`
- `relayLoadStateByUrl`
- request identity guard (for stale async probes)

- [ ] **Step 4: Wire modal open/close and initial probe**

On `Ver estado`, open modal and fire probe for selected relay.

- [ ] **Step 5: Wire manual refresh action**

On `Actualizar`, run probe again while keeping previous snapshot visible.

- [ ] **Step 6: Add stale response guard**

Use request identity so out-of-order async probe responses cannot overwrite latest selected relay state.

- [ ] **Step 7: Render row status badges from latest snapshot**

Show compact status in relay list without polling.

- [ ] **Step 8: Run focused tests to verify pass**

Run: `pnpm vitest run src/nostr-overlay/App.test.tsx -t "relay status:"`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/nostr-overlay/components/MapSettingsModal.tsx src/nostr-overlay/App.test.tsx
git commit -m "feat: show per-relay status and manual refresh in settings"
```

## Chunk 3: Hardening + Verification

### Task 5: Error handling and fallback coverage

**Files:**
- Modify: `src/nostr/relay-health.test.ts`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Add edge-case tests (red phase)**

Add tests for:
- timeout shows disconnected + lastError
- refresh failure preserves previous valid snapshot
- invalid relay URL shows friendly error state

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run src/nostr/relay-health.test.ts src/nostr-overlay/App.test.tsx`
Expected: FAIL for new edge cases.

- [ ] **Step 3: Implement minimal fixes (green phase)**

Implement only code needed to satisfy new edge-case tests.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run src/nostr/relay-health.test.ts src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr/relay-health.test.ts src/nostr-overlay/App.test.tsx
git commit -m "test: cover relay health error and fallback flows"
```

### Task 6: Full project verification gate

**Files:** no new files.

- [ ] **Step 1: Run full unit tests**

Run: `pnpm test:unit`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Final commit (if needed, explicit files only)**

```bash
git add src/nostr/relay-health-session.ts src/nostr/relay-health-session.test.ts src/nostr/relay-health.ts src/nostr/relay-health.test.ts src/nostr-overlay/components/RelayDetailModal.tsx src/nostr-overlay/components/MapSettingsModal.tsx src/nostr-overlay/styles.css src/nostr-overlay/App.test.tsx
git commit -m "feat: add relay diagnostics modal with session metrics"
```

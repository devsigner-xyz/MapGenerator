# Nostr Relay Request Scheduler Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir los `NOTICE` de relays como `too many concurrent REQs` y `Too fast, slow down` centralizando, agrupando y limitando las consultas Nostr del BFF.

**Architecture:** El BFF pasara a usar un unico `RelayQueryExecutor` como seam publica de lecturas Nostr. El executor mantendra una API pequena (`query`/`queryMany`) y separara responsabilidades internamente: normalizacion de relay, slot scheduling por relay, lifecycle one-shot, dedupe por evento y cooldown por rate-limit. Los servicios `social`, `dm`, `identity`, `notifications`, `graph`, `content` y `users` compartiran ese executor para evitar bypasses con `pool.querySync` directo; `RelayGateway` seguira siendo el owner de timeouts/cache/inflight por request HTTP.

**Tech Stack:** TypeScript, Fastify BFF, nostr-tools `SimplePool`/`AbstractRelay`, NIP-01 `REQ`/`CLOSE`/`NOTICE`/`CLOSED`, Vitest, pnpm

---

## Source Findings

**Reviewed clients:** `context/clients/ditto-main`, `nostrudel-master`, `primal-web-app-main`, `snort-main`, `whitenoise-master`, `coracle-master`.

**Best practices to carry into this repo:**
- Snort respects `max_subscriptions` and queues when full: `context/clients/snort-main/snort-main/packages/system/src/query-manager.ts:356`, `connection.ts:376`.
- Snort closes non-streaming requests on EOSE: `context/clients/snort-main/snort-main/packages/system/src/query-manager.ts:314`.
- Snort compresses compatible filters before sending: `context/clients/snort-main/snort-main/packages/system/src/query-manager.ts:247`, `query-optimizer/request-merger.ts:12`.
- Ditto batches same-tick lookups and chunks at 50: `context/clients/ditto-main/ditto-main/src/lib/NostrBatcher.ts:4`, `:18`, `:88`.
- noStrudel uses a singleton pool with liveness/backoff and captures NOTICEs: `context/clients/nostrudel-master/nostrudel-master/src/services/pool.ts:9`, `:13`, `:44`.
- Coracle caps relay fanout and uses auto-close one-shot requests: `context/clients/coracle-master/coracle-master/src/engine/state.ts:237`, `requests.ts:156`.
- Coracle chunks bulk pubkey loads with pauses: `context/clients/coracle-master/coracle-master/src/engine/requests.ts:173`.
- White Noise uses bounded queue concurrency and queued retries: `context/clients/whitenoise-master/whitenoise-master/src/whitenoise/user_search/mod.rs:32`, `:728`.
- White Noise classifies `too many requests` and `slow down` as rate-limited: `context/clients/whitenoise-master/whitenoise-master/src/relay_control/observability.rs:86`.

**Repo-specific root cause:**
- `server/src/relay/relay-query-executor.ts:37` currently delegates to `pool.querySync()` without per-relay scheduling or NOTICE/CLOSED handling.
- `server/src/modules/social/social.service.ts`, `server/src/modules/dm/dm.service.ts`, and `server/src/modules/identity/identity.service.ts` still call `pool.querySync()` directly, bypassing the shared executor.
- `social` engagement, `dm` backfills, and `users` exact/text search create parallel `REQ` bursts over the same relay set.

## File Structure

**Modify:** `server/src/relay/relay-query-executor.ts`
- Public seam for relay reads. Keep public API small and implement internal seams for relay URL normalization, per-relay slot scheduling, one-shot subscription lifecycle, event dedupe, rate-limit classification, and cooldown state.
- Do not add public scheduler/control methods unless runtime validation proves they are needed.

**Modify:** `server/src/relay/relay-query-executor.test.ts`
- Covers RED/GREEN behavior for scheduler, multi-filter grouping, close behavior, abort cleanup, gateway-compatible max-wait behavior, cooldown, relay URL normalization, and safe NOTICE handler chaining.

**Modify:** `server/src/modules/social/social.service.ts`
- Uses `RelayQueryExecutor` for feed, thread, and engagement reads. Engagement becomes one multi-filter query instead of four parallel `querySync()` calls.

**Modify:** `server/src/modules/social/social.service.test.ts`
- Verifies social service calls `queryMany` for engagement/thread reads and preserves engagement counters, zap sats, thread partitioning, sorting, dedupe, and signal propagation.

**Modify:** `server/src/modules/dm/dm.service.ts`
- Uses `RelayQueryExecutor.queryMany()` for inbox, conversation, and stream filter pairs.

**Modify:** `server/src/modules/dm/dm.service.test.ts`
- Verifies DM backfills and stream reads group filters through the executor and propagate abort signals.

**Modify:** `server/src/modules/identity/identity.service.ts`
- Uses the shared `RelayQueryExecutor` for profile metadata batches.

**Modify:** `server/src/modules/identity/identity.service.test.ts`
- Verifies profile batch reads go through the executor and still cache/inflight-dedupe.

**Modify:** `server/src/modules/users/users.service.ts`
- Uses `RelayQueryExecutor.queryMany()` for exact-pubkey and text-search profile filters instead of parallel same-relay executor queries.

**Modify:** `server/src/modules/users/users.service.test.ts`
- Verifies search reads use a single multi-filter executor call when both exact and text filters are needed, while preserving exact-first result ordering.

**Modify:** `server/src/services/app-services.ts`
- Injects the existing shared `relayQueryExecutor` into every relay-reading service. `graph`, `content`, `notifications`, and `users` already accept the executor; this task closes the remaining `identity`, `social`, and `dm` bypasses.

**Modify:** `server/src/services/app-services.test.ts`
- Verifies all relay-reading services receive the shared executor.

**Optional later, only if notices persist:** `server/src/modules/dm/dm.service.ts`, `server/src/modules/notifications/notifications.service.ts`
- Add idle backoff to SSE polling loops after the scheduler is in place.

## Review-Driven Constraints

- Treat relay pressure as essential complexity, but keep accidental complexity low: one public executor seam, focused internal helpers, no speculative runtime knobs exposed to services.
- Do not mutate `relay.onnotice` per query. `onnotice` is relay-global in `nostr-tools`; install or chain a relay-level NOTICE observer once per relay state, and use subscription `onclose` for `CLOSED` reasons.
- `defaultMaxWaitMs`/`maxWaitMs` are one-shot EOSE cutoffs for relay subscriptions, not HTTP request timeouts. `RelayGateway` remains responsible for request timeout errors and abort signals.
- `cacheKey` on executor requests is compatibility-only. Do not add executor-level caching; cache/inflight behavior stays in `RelayGateway`.
- Abort signals from `RelayGatewayQueryContext` are mandatory for migrated service fetchers. If a service receives `context.signal`, pass it to `query()` or `queryMany()`.
- Preserve fallback behavior: reject `ensureRelay()`/connection failures so `shouldUseFallbackRelays()` can still try fallback relays. Resolve collected events only after a subscription successfully opened and then EOSE/CLOSED/max-wait occurs.
- Prefer behavior tests over call-shape-only tests for service migrations. Call-shape tests are allowed, but must be paired with assertions that DTO output, sorting, pagination, dedupe, and counters remain unchanged.

**Commit policy:** This repository guidance says not to commit unless the user explicitly asks. Implementation agents should skip commit steps unless the user asks for commits.

---

## Chunk 1: Relay Query Executor Scheduler

**Suggested skills:** `test-driven-development`, `nostr-specialist`, `vitest`, `systematic-debugging`, `typescript-advanced-types`

### Task 1: Define scheduler behavior with failing tests

**Files:**
- Modify: `server/src/relay/relay-query-executor.test.ts`

- [ ] **Step 1: Add test for same-relay concurrency limiting**

Add a test that creates an executor with `maxConcurrentPerRelay: 1`, a fake pool whose `ensureRelay()` returns a relay that does not emit EOSE until the test releases it, and then calls two queries against `wss://relay.one`.

Test intent:

```ts
it('queues queries when the same relay is at the concurrency limit', async () => {
  const firstRelease = createDeferred<void>();
  const secondRelease = createDeferred<void>();
  const started: string[] = [];
  const relay = createFakeRelay({
    subscribe(_filters, params) {
      started.push('sub');
      const release = started.length === 1 ? firstRelease : secondRelease;
      void release.promise.then(() => params.oneose?.());
      return { close: vi.fn() };
    },
  });
  const executor = createRelayQueryExecutor({
    pool: createFakePool({ 'wss://relay.one': relay }),
    maxConcurrentPerRelay: 1,
    defaultMaxWaitMs: 10_000,
  });

  const first = executor.query({ relays: ['wss://relay.one'], filter: { kinds: [1] } });
  const second = executor.query({ relays: ['wss://relay.one'], filter: { kinds: [0] } });
  await flushPromises();

  expect(started).toHaveLength(1);
  firstRelease.resolve();
  await first;
  await flushPromises();
  expect(started).toHaveLength(2);
  secondRelease.resolve();
  await second;
});
```

- [ ] **Step 2: Run RED test**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts -t "queues queries when the same relay is at the concurrency limit"`

Expected: FAIL because `createRelayQueryExecutor` currently has no scheduler and uses `querySync()`.

- [ ] **Step 3: Add test for parallelism across different relays**

Add a test proving `wss://relay.one` and `wss://relay.two` can start together even when `maxConcurrentPerRelay` is `1`.

- [ ] **Step 4: Run RED test**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts -t "allows different relays to query concurrently"`

Expected: FAIL for the same reason.

### Task 2: Implement minimal per-relay scheduler

**Files:**
- Modify: `server/src/relay/relay-query-executor.ts`

- [ ] **Step 5: Extend executor options and interface**

Add these shapes:

```ts
export interface RelayQueryRequest {
  relays: string[];
  filter: Filter;
  // Compatibility-only. RelayGateway owns cache/inflight behavior.
  cacheKey?: string;
  signal?: AbortSignal;
  maxWaitMs?: number;
}

export interface RelayQueryManyRequest {
  relays: string[];
  filters: Filter[];
  // Compatibility-only. RelayGateway owns cache/inflight behavior.
  cacheKey?: string;
  signal?: AbortSignal;
  maxWaitMs?: number;
}

export interface RelayQueryExecutor {
  query<TEvent>(request: RelayQueryRequest): Promise<TEvent[]>;
  queryMany<TEvent>(request: RelayQueryManyRequest): Promise<TEvent[]>;
}

export interface CreateRelayQueryExecutorOptions {
  pool: SimplePool;
  maxConcurrentPerRelay?: number;
  defaultMaxWaitMs?: number;
  rateLimitCooldownMs?: number;
  maxRateLimitCooldownMs?: number;
  nowMs?: () => number;
  jitterMs?: () => number;
}
```

Use conservative defaults inside `createRelayQueryExecutor()`:

```ts
const maxConcurrentPerRelay = options.maxConcurrentPerRelay ?? 1;
const defaultMaxWaitMs = options.defaultMaxWaitMs ?? 10_000;
const rateLimitCooldownMs = options.rateLimitCooldownMs ?? 2_000;
const maxRateLimitCooldownMs = options.maxRateLimitCooldownMs ?? 30_000;
const nowMs = options.nowMs ?? Date.now;
const jitterMs = options.jitterMs ?? (() => Math.floor(Math.random() * 250));
```

`defaultMaxWaitMs` is an EOSE cutoff for one-shot subscriptions. It should close and resolve collected events when no EOSE arrives; it should not create a `TimeoutError`. Request-level timeout errors stay in `RelayGateway`.

- [ ] **Step 6: Add queue state per relay**

Use a map keyed by normalized relay URL:

```ts
interface RelayQueuedOperation {
  start: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface RelaySchedulerState {
  active: number;
  queue: RelayQueuedOperation[];
  cooldownUntilMs: number;
  rateLimitCount: number;
  noticeObserverInstalled: boolean;
}
```

Normalize relay URLs with the existing `normalizeRelayUrl()` from `server/src/relay/relay-resolver.ts`. Invalid URLs should be skipped the same way existing relay-set helpers skip them. If no valid relays remain, `query()` and `queryMany()` should resolve `[]` without touching the pool.

Implement `runWithRelaySlot(relayUrl, run)` so only `maxConcurrentPerRelay` operations run at a time for a relay. Always decrement `active` in `finally` and drain the next queued item. Apply `cooldownUntilMs` before starting the next queued operation for that relay; other relays must remain unaffected.

Queued operations must observe abort signals before subscription starts. If a queued operation aborts while waiting for a slot or cooldown, remove it from the queue, reject promptly with `AbortError`, and do not call `ensureRelay()` for that operation.

- [ ] **Step 7: Make `query()` delegate to `queryMany()`**

`query()` should keep existing API behavior:

```ts
async query<TEvent>(request: RelayQueryRequest): Promise<TEvent[]> {
  return this.queryMany<TEvent>({
    relays: request.relays,
    filters: [request.filter],
    ...(request.cacheKey ? { cacheKey: request.cacheKey } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
    ...(request.maxWaitMs !== undefined ? { maxWaitMs: request.maxWaitMs } : {}),
  });
}
```

- [ ] **Step 8: Implement one-shot relay query using `ensureRelay().subscribe()`**

For each relay:
- Call `pool.ensureRelay(relayUrl, { abort: signal })`.
- If `ensureRelay()` rejects, reject this relay operation so existing fallback logic can run.
- Install the executor's relay-level NOTICE observer once per relay state, chaining any existing `relay.onnotice` handler. Do not assign `relay.onnotice` per query.
- Subscribe with all filters for that relay in a single `REQ`.
- Collect events.
- Use a `completeOnce()` helper so EOSE, `onclose`, abort, and max-wait cannot resolve/reject the same promise twice.
- On EOSE, call `subscription.close('closed after eose')` and resolve collected events.
- On subscription `onclose`, mark cooldown if the `CLOSED` reason is rate-limited, then resolve collected events. Non-rate-limit `CLOSED` should resolve collected events for best-effort parity with `querySync()`.
- Close on abort and reject with `AbortError`.
- On `maxWaitMs`/`defaultMaxWaitMs`, close and resolve collected events. This preserves one-shot behavior without conflicting with `RelayGateway` timeout errors.

- [ ] **Step 9: Dedupe returned events by id**

`SimplePool.querySync()` dedupes cross-relay events internally. Preserve that observable behavior by deduping flat results in `queryMany()` by `event.id` when present.

- [ ] **Step 10: Run GREEN tests**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts`

Expected: PASS for existing and new executor tests.

### Task 3: Add lifecycle, abort, and rate-limit tests

**Files:**
- Modify: `server/src/relay/relay-query-executor.test.ts`
- Modify: `server/src/relay/relay-query-executor.ts`

- [ ] **Step 11: Add failing test for grouped filters**

Verify `queryMany({ relays: ['wss://relay.one'], filters: [filterA, filterB] })` sends one subscription to the relay with both filters, not two subscriptions.

Also add a test that `query({ relays: ['not-a-relay'], filter })` resolves `[]` and does not call `pool.ensureRelay()`.

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts -t "groups multiple filters into one relay subscription|returns empty results when no relay URLs are valid"`

Expected: FAIL until `queryMany` uses a single `relay.subscribe(filters, ...)` per relay.

- [ ] **Step 12: Add failing test for CLOSE on EOSE**

Verify the fake subscription `close` function is called after EOSE.

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts -t "closes one-shot subscriptions after eose"`

Expected: FAIL until the one-shot lifecycle closes the subscription.

- [ ] **Step 13: Add failing test for abort cleanup**

Use `AbortController`, start a query, abort it, and assert subscription `close` is called and the promise rejects with `AbortError` or an abort-shaped error.

Add a separate queued-abort case: start a first query that holds the only same-relay slot, start a second query with its own `AbortController`, abort the second before the first releases, and assert the second rejects promptly, is removed from the queue, and never calls `ensureRelay()`/`subscribe()`.

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts -t "closes subscriptions when aborted|rejects queued queries when aborted"`

Expected: FAIL until abort is wired.

- [ ] **Step 14: Add failing tests for NOTICE/CLOSED cooldown**

Add separate tests for:

- Relay-level `NOTICE` containing `too many concurrent REQs` triggers cooldown.
- Subscription `onclose`/`CLOSED` reason containing `Too fast, slow down` triggers cooldown.
- A successful non-rate-limited relay query after cooldown resets `rateLimitCount`, so the next rate-limit starts from the base cooldown.

For each cooldown test, verify the next query to the same relay waits until `cooldownUntilMs` before starting, while another relay is unaffected.

Use a deterministic `nowMs`/`jitterMs` in the test.

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts -t "backs off a relay after rate-limit notices|backs off a relay after rate-limit closed messages|resets relay cooldown count after a successful query"`

Expected: FAIL until rate-limit classification and cooldown are implemented.

- [ ] **Step 15: Add failing tests for handler safety and connection errors**

Add tests that verify:

- An existing `relay.onnotice` handler is still called after the executor installs its observer.
- Two overlapping queries against the same relay do not replace the NOTICE observer repeatedly.
- `ensureRelay()` rejection rejects `query()` so callers can use existing fallback behavior.

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts -t "preserves relay notice handlers|rejects when relay connection fails"`

Expected: FAIL until NOTICE observer installation and connection error propagation are implemented.

- [ ] **Step 16: Implement rate-limit classifier and cooldown**

Add an internal function:

```ts
function isRateLimitRelayMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('rate limit')
    || normalized.includes('rate-limited')
    || normalized.includes('too many')
    || normalized.includes('slow down')
    || normalized.includes('too fast');
}
```

When rate-limited from either relay-level `NOTICE` or subscription `onclose` reason, set:

```ts
const delay = Math.min(maxRateLimitCooldownMs, rateLimitCooldownMs * 2 ** Math.min(state.rateLimitCount, 4));
state.rateLimitCount += 1;
state.cooldownUntilMs = nowMs() + delay + jitterMs();
```

Reset `rateLimitCount` after a successful relay query with no rate-limit messages for that relay. Keep the helper internal unless tests need a behavior-only seam; do not export it as public API.

- [ ] **Step 17: Run executor suite**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts`

Expected: PASS.

---

## Chunk 2: Route BFF Services Through The Shared Executor

**Suggested skills:** `test-driven-development`, `nostr-specialist`, `fastify-best-practices`, `vitest`

### Task 4: Migrate social service reads

**Files:**
- Modify: `server/src/modules/social/social.service.test.ts`
- Modify: `server/src/modules/social/social.service.ts`

- [ ] **Step 18: Write failing social tests**

Add tests for:

- `getEngagement()` calls `relayQueryExecutor.queryMany()` once with four filters for replies/reposts/reactions/zaps.
- `getFollowingFeed()` calls `relayQueryExecutor.query()` for contact list and feed reads.
- `getThread()` calls `relayQueryExecutor.queryMany()` once with root and replies filters.
- Behavioral engagement test with mixed reply/repost/reaction/zap events in one flat executor result, verifying counters and `zapSats` stay correct.
- Behavioral thread test proving the flat `queryMany()` result is partitioned into root and replies correctly.
- Signal propagation test proving `context.signal` reaches every executor call.

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/social/social.service.test.ts`

Expected: FAIL because social currently calls `pool.querySync()` directly.

- [ ] **Step 19: Add `relayQueryExecutor` option to social service**

Extend `SocialServiceOptions`:

```ts
relayQueryExecutor?: RelayQueryExecutor;
```

In `createSocialService()`, create a default executor from the local pool only when one is not supplied.

- [ ] **Step 20: Replace direct `pool.querySync()` calls**

Use:

```ts
options.relayQueryExecutor.query<NostrEventLike>({ relays, filter, signal: context.signal })
```

and for multi-filter cases:

```ts
options.relayQueryExecutor.queryMany<NostrEventLike>({ relays, filters: engagementFilters, signal: context.signal })
```

Keep existing sorting, dedupe, pagination, and mapping behavior unchanged.

For `getEngagement()`, partition the flat result by `kind` before applying the existing counters:

```ts
const engagementEvents = await options.relayQueryExecutor.queryMany<NostrEventLike>({
  relays,
  filters: engagementFilters,
  signal: context.signal,
});
const replies = engagementEvents.filter((event) => event.kind === 1);
const reposts = engagementEvents.filter((event) => event.kind === 6);
const reactions = engagementEvents.filter((event) => event.kind === 7);
const zaps = engagementEvents.filter((event) => event.kind === 9735);
```

For `getThread()`, partition by `event.id === query.rootEventId` for the root and by matching `#e` tags for replies. Do not rely on filter order because `queryMany()` returns a deduped flat list.

- [ ] **Step 21: Run social tests**

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/social/social.service.test.ts`

Expected: PASS.

### Task 5: Migrate DM service reads

**Files:**
- Modify: `server/src/modules/dm/dm.service.test.ts`
- Modify: `server/src/modules/dm/dm.service.ts`

- [ ] **Step 22: Write failing DM tests**

Add tests for:

- `getInboxEvents()` uses `queryMany()` once for authors and `#p` filters.
- `getConversationEvents()` uses `queryMany()` once for owner-to-peer and peer-to-owner filters.
- `streamDmEvents()` uses `queryMany()` once per poll iteration.
- Every executor call receives the gateway `context.signal`.
- Aborting the stream signal closes/aborts the current executor query instead of waiting for the next polling delay.

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/dm/dm.service.test.ts`

Expected: FAIL because DM currently uses direct `pool.querySync()` inside `Promise.all`.

- [ ] **Step 23: Add `relayQueryExecutor` option to DM service**

Extend `DmServiceOptions`:

```ts
relayQueryExecutor?: RelayQueryExecutor;
```

Default it with `createRelayQueryExecutor({ pool })` when missing.

- [ ] **Step 24: Replace `queryEventsOnRelays()` implementation**

Change the helper to call:

```ts
return options.relayQueryExecutor.queryMany<NostrEventLike>({ relays, filters, signal });
```

Make `signal` a required argument to the helper and pass `context.signal` from inbox, conversation, and stream fetchers. Do not leave this for a later migration.

- [ ] **Step 25: Run DM tests**

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/dm/dm.service.test.ts`

Expected: PASS.

### Task 6: Migrate identity profile reads

**Files:**
- Modify: `server/src/modules/identity/identity.service.test.ts`
- Modify: `server/src/modules/identity/identity.service.ts`

- [ ] **Step 26: Write failing identity test**

Add tests that verify:

- `resolveProfiles()` with uncached pubkeys calls the injected executor instead of `pool.querySync()`.
- Existing cache and `profileBatchInflight` dedupe behavior is unchanged.
- A recoverable executor rejection still allows fallback relay behavior where current `pool.querySync()` errors would have done so.

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/identity/identity.service.test.ts`

Expected: FAIL because identity currently calls `this.options.pool.querySync()` directly.

- [ ] **Step 27: Add `relayQueryExecutor` to `IdentityServiceOptions`**

Include it in the required `GatewayIdentityService` options and default it in `createIdentityService()`.

- [ ] **Step 28: Replace profile batch `pool.querySync()`**

Use:

```ts
return this.options.relayQueryExecutor.query<NostrEventLike>({
  relays,
  filter: {
    authors: pubkeys,
    kinds: [METADATA_KIND],
    limit: Math.max(pubkeys.length * 2, pubkeys.length + 1),
  },
});
```

- [ ] **Step 29: Run identity tests**

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/identity/identity.service.test.ts`

Expected: PASS.

### Task 7: Compact users search reads

**Files:**
- Modify: `server/src/modules/users/users.service.test.ts`
- Modify: `server/src/modules/users/users.service.ts`

- [ ] **Step 30: Write failing users search tests**

Add tests for:

- Search with both an exact pubkey/npub and text query uses one `relayQueryExecutor.queryMany()` call with both filters instead of `Promise.all` over two `query()` calls.
- Search with only text still uses one executor call.
- Exact matches remain ordered before text matches in the response.
- `context.signal` is passed into the executor call.

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/users/users.service.test.ts`

Expected: FAIL because users search currently builds parallel executor `query()` promises.

- [ ] **Step 31: Replace users search parallel queries with `queryMany()`**

Build a `filters: Filter[]` array and call the executor once:

```ts
const filters: Filter[] = [];
if (exactPubkeys.length > 0) {
  filters.push({
    authors: exactPubkeys,
    kinds: [METADATA_KIND],
    limit: exactPubkeys.length,
  });
}

filters.push(textFilter);

return options.relayQueryExecutor.queryMany<NostrEventLike>({
  relays: textSearchRelays,
  filters,
  signal: context.signal,
});
```

Keep the existing `try/catch` behavior that returns an empty list on relay search failures.

- [ ] **Step 32: Run users tests**

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/users/users.service.test.ts`

Expected: PASS.

---

## Chunk 3: Shared App-Service Wiring

**Suggested skills:** `test-driven-development`, `fastify-best-practices`, `vitest`

### Task 8: Inject one executor into all relay-reading services

**Files:**
- Modify: `server/src/services/app-services.test.ts`
- Modify: `server/src/services/app-services.ts`

- [ ] **Step 33: Write failing app-services test**

Verify the `relayQueryExecutor` created in `createAppServices()` is passed into:

- `identityService`
- `graphService`
- `contentService`
- `socialService`
- `notificationsService`
- `usersService`
- `dmService`

Run: `pnpm vitest run --config vitest.config.mts server/src/services/app-services.test.ts`

Expected: FAIL for `identityService`, `socialService`, and `dmService` until they are wired.

- [ ] **Step 34: Wire the shared executor**

Change `createAppServices()` so it constructs one `SimplePool`, one `RelayQueryExecutor`, and passes the executor into every service that accepts it.

Expected shape:

```ts
const pool = options.pool ?? new SimplePool();
const relayQueryExecutor = options.relayQueryExecutor ?? createRelayQueryExecutor({ pool });

return {
  relayQueryExecutor,
  identityService: createIdentityService({ pool, bootstrapRelays, relayQueryExecutor }),
  graphService: createGraphService({ pool, bootstrapRelays, relayQueryExecutor }),
  contentService: createContentService({ pool, bootstrapRelays, relayQueryExecutor }),
  socialService: createSocialService({ pool, bootstrapRelays, relayQueryExecutor }),
  notificationsService: createNotificationsService({ pool, bootstrapRelays, relayQueryExecutor }),
  usersService: createUsersService({ pool, bootstrapRelays, relayQueryExecutor }),
  dmService: createDmService({ pool, bootstrapRelays, relayQueryExecutor }),
  publishService: createPublishService(),
};
```

- [ ] **Step 35: Run app-services tests**

Run: `pnpm vitest run --config vitest.config.mts server/src/services/app-services.test.ts`

Expected: PASS.

---

## Chunk 4: Focused Regression Checks

**Suggested skills:** `verification-before-completion`, `vitest`, `systematic-debugging`

### Task 9: Run focused backend tests

**Files:**
- No file changes expected.

- [ ] **Step 36: Run executor and migrated service tests**

Run: `pnpm vitest run --config vitest.config.mts server/src/relay/relay-query-executor.test.ts server/src/modules/social/social.service.test.ts server/src/modules/dm/dm.service.test.ts server/src/modules/identity/identity.service.test.ts server/src/modules/users/users.service.test.ts server/src/services/app-services.test.ts`

Expected: PASS.

- [ ] **Step 37: Run adjacent relay tests**

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/notifications/notifications.service.test.ts server/src/modules/graph/graph.service.test.ts server/src/modules/content/content.service.test.ts server/src/relay/author-relay-directory.test.ts server/src/relay/relay-query-planner.test.ts`

Expected: PASS.

- [ ] **Step 38: Run server typecheck**

Run: `pnpm typecheck:server`

Expected: PASS.

- [ ] **Step 39: Run server lint if touched files pass typecheck**

Run: `pnpm lint:server`

Expected: PASS or only pre-existing unrelated warnings. Fix any new errors in touched files.

---

## Chunk 5: Runtime Validation And Optional Stream Backoff

**Suggested skills:** `systematic-debugging`, `nostr-specialist`, `verification-before-completion`

### Task 10: Validate relay pressure manually

**Files:**
- No file changes expected unless runtime validation exposes a missed call path.

- [ ] **Step 40: Start the dev stack**

Run: `make dev`

Expected: BFF on `127.0.0.1:3000`, Vite on `127.0.0.1:5173`, docs on `127.0.0.1:5174`.

- [ ] **Step 41: Exercise high-pressure flows**

Manual steps:

- Log in or restore a Nostr session.
- Open Agora/following feed.
- Open notifications.
- Open chats.
- Open an active profile and load profile network/posts.
- Search users.

Expected: Console no longer shows repeated bursts of `NOTICE from wss://relay.primal.net/: ERROR: too many concurrent REQs` or `Too fast, slow down`. Occasional relay warnings may still occur because public relays are external systems, but they should not repeat in bursts.

- [ ] **Step 42: If notices persist, identify remaining call path before fixing**

Search for direct calls:

Use content search for `querySync(` under `server/src` and inspect every runtime hit.

Then run: `pnpm lint:server`

Expected: No direct `pool.querySync()` in runtime BFF service paths except tests or intentionally isolated code.

### Task 11: Optional stream polling backoff if scheduler is not enough

**Files:**
- Modify: `server/src/modules/dm/dm.service.test.ts`
- Modify: `server/src/modules/dm/dm.service.ts`
- Modify: `server/src/modules/notifications/notifications.service.test.ts`
- Modify: `server/src/modules/notifications/notifications.service.ts`

- [ ] **Step 43: Only proceed if runtime validation still shows stream-related pressure**

Do not implement this preemptively. The scheduler may already solve the observed problem.

- [ ] **Step 44: Write failing tests for idle backoff**

Test that stream loops increase wait time after empty polls and reset after emitting an item.

Suggested constants:

```ts
const STREAM_POLL_INTERVAL_MS = 1_500;
const STREAM_MAX_IDLE_POLL_INTERVAL_MS = 10_000;
```

- [ ] **Step 45: Implement minimal idle backoff**

In `streamDmEvents()` and `streamNotifications()`, track `idlePolls`. Use:

```ts
const delay = Math.min(
  STREAM_MAX_IDLE_POLL_INTERVAL_MS,
  STREAM_POLL_INTERVAL_MS * 2 ** Math.min(idlePolls, 3),
);
```

Reset `idlePolls = 0` after emitting any item.

- [ ] **Step 46: Run stream tests**

Run: `pnpm vitest run --config vitest.config.mts server/src/modules/dm/dm.service.test.ts server/src/modules/notifications/notifications.service.test.ts`

Expected: PASS.

---

## Completion Checklist

- [ ] Tests were written and observed failing before production changes.
- [ ] `RelayQueryExecutor` is the only runtime BFF path that opens relay read `REQ`s.
- [ ] Multi-filter reads use one `REQ` per relay, not `Promise.all` over related filters.
- [ ] One-shot subscriptions send `CLOSE` after EOSE/abort/max-wait.
- [ ] Rate-limit `NOTICE`/`CLOSED` text triggers per-relay cooldown.
- [ ] Relay-level NOTICE handling is installed/chained safely and is not mutated per query.
- [ ] Migrated service fetchers pass `RelayGatewayQueryContext.signal` into executor calls.
- [ ] Services share the same executor from `createAppServices()`.
- [ ] `usersService` exact/text profile search uses one `queryMany()` call when both filters are present.
- [ ] Focused backend tests pass.
- [ ] `pnpm typecheck:server` passes.
- [ ] Runtime manual validation shows relay warnings reduced or gone.

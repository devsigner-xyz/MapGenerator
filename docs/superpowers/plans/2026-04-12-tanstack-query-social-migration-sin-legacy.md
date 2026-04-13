# TanStack Query Social Migration (No Legacy) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar feed, hilos, notificaciones y mensajes directos a TanStack Query, eliminando deuda tecnica de stores manuales e impidiendo que quede codigo legacy en el overlay social.

**Architecture:** Separar explicitamente server-state (Query cache) de UI-state local. Todas las cargas, paginacion, invalidaciones, optimistic updates y reconciliacion realtime pasan por `QueryClient`. Se elimina la capa de stores imperativos (`getState/subscribe`) para social features y se borran archivos legacy en la misma fase en que se reemplazan.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Nostr runtime services, Vitest.

---

## Non-Negotiable Constraints

- No wrappers legacy (`*Legacy`, adapters temporales, dual wiring).
- Reemplazo + borrado en la misma fase funcional.
- Cada fase debe terminar con test verde y sin imports huérfanos.
- Ningun feature social debe seguir dependiendo de `store.getState()` manual al finalizar.

---

## Chunk 1: Query Foundation and Contracts

### Task 1: Introduce QueryClient and canonical query keys

**Files:**
- Modify: `package.json`
- Modify: `src/nostr-overlay/bootstrap.tsx`
- Create: `src/nostr-overlay/query/query-client.ts`
- Create: `src/nostr-overlay/query/keys.ts`
- Create: `src/nostr-overlay/query/types.ts`

- [x] **Step 1: Add failing bootstrap test for missing Query provider**
Add test coverage in `src/nostr-overlay/App.test.tsx` that renders a component using React Query hooks under current bootstrap and verifies provider is required.

- [x] **Step 2: Run targeted test to confirm failure**
Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx -t "query provider"`
Expected: FAIL (no `QueryClientProvider`).

- [x] **Step 3: Add dependency and Query client factory**
Install and configure `@tanstack/react-query` with defaults:
- `staleTime` tuned for social reads,
- `gcTime` bounded,
- retries conservative for relay errors.

- [x] **Step 4: Wire provider in bootstrap**
Wrap `<App />` with `<QueryClientProvider>` in `src/nostr-overlay/bootstrap.tsx`.

- [x] **Step 5: Add strongly typed query keys**
Create canonical keys for:
- following feed,
- thread,
- engagement,
- notifications,
- direct messages (list + conversation).

- [x] **Step 6: Re-run tests**
Run: `pnpm test:unit -- src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**
`git commit -m "chore: add tanstack query foundation for nostr overlay"`

---

## Chunk 2: Following Feed and Thread on TanStack Query

### Task 2: Replace `useFollowingFeed` store with query-driven controller

**Files:**
- Create: `src/nostr-overlay/query/following-feed.query.ts`
- Create: `src/nostr-overlay/query/following-feed.selectors.ts`
- Create: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Delete: `src/nostr-overlay/hooks/useFollowingFeed.ts`
- Delete: `src/nostr-overlay/hooks/useFollowingFeed.test.ts`

- [x] **Step 1: Add failing tests for feed pagination via Query**
Update tests to assert `onLoadMoreFeed` and thread open/load behaviors via query-backed controller (not store methods).

- [x] **Step 2: Run targeted tests to confirm failure**
Run: `pnpm test:unit -- src/nostr-overlay/components/FollowingFeedSurface.test.tsx -t "load more"`
Expected: FAIL (controller/query path missing).

- [x] **Step 3: Implement feed and thread infinite queries**
In `following-feed.query.ts`:
- `useInfiniteQuery` for feed (`loadFollowingFeed`),
- `useInfiniteQuery` for thread (`loadThread`),
- normalized merge/dedupe in selectors.

- [x] **Step 4: Build controller hook for UI consumption**
In `useFollowingFeedController.ts`, expose declarative view model:
- `items`, `isLoadingFeed`, `feedError`, `hasMoreFeed`,
- `activeThread`, `openThread`, `closeThread`, `loadMoreThread`.

- [x] **Step 5: Replace App wiring and remove store calls**
Update `src/nostr-overlay/App.tsx` to consume controller data; remove `followingFeed.getState()` and direct store method wiring.

- [x] **Step 6: Delete legacy feed store files immediately**
Delete `useFollowingFeed.ts` and `useFollowingFeed.test.ts` after replacement compiles.

- [x] **Step 7: Re-run tests**
Run: `pnpm test:unit -- src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**
`git commit -m "refactor: migrate following feed and thread state to tanstack query"`

---

## Chunk 3: Engagement and Mutations with Optimistic Updates

### Task 3: Move post/reply/reaction/repost to query mutations

**Files:**
- Create: `src/nostr-overlay/query/following-feed.mutations.ts`
- Modify: `src/nostr-overlay/query/following-feed.selectors.ts`
- Modify: `src/nostr-overlay/hooks/useFollowingFeedController.ts`
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [x] **Step 1: Add failing tests for optimistic behavior**
Add tests covering:
- optimistic reaction/repost counters,
- rollback on mutation failure,
- reply insertion + reconciliation.

- [x] **Step 2: Run targeted tests to confirm failure**
Run: `pnpm test:unit -- src/nostr-overlay/components/FollowingFeedSurface.test.tsx -t "optimistic"`
Expected: FAIL.

- [x] **Step 3: Implement mutation hooks**
Use `useMutation` + `onMutate/onError/onSettled` and `queryClient.setQueryData` for optimistic cache updates.

- [x] **Step 4: Remove legacy pending maps from source-of-truth path**
Ensure UI state comes from mutation/query states rather than hand-managed `pending*ByEventId` maps.

- [x] **Step 5: Wire mutations to feed UI actions**
`FollowingFeedContent` should call mutation handlers from controller.

- [x] **Step 6: Re-run tests**
Run: `pnpm test:unit -- src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**
`git commit -m "feat: add tanstack query optimistic mutations for social feed actions"`

---

## Chunk 4: Notifications Migration to Query (Realtime Included)

### Task 4: Replace social notifications store and unread heuristic

**Files:**
- Create: `src/nostr-overlay/query/social-notifications.query.ts`
- Create: `src/nostr-overlay/query/read-state.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/NotificationsDialog.tsx`
- Modify: `src/nostr-overlay/components/NotificationsDialog.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Delete: `src/nostr-overlay/hooks/useSocialNotifications.ts`
- Delete: `src/nostr-overlay/hooks/useSocialNotifications.test.ts`

- [x] **Step 1: Add failing tests for unread semantics**
Cover unread based on `lastReadAt` and incoming realtime events.

- [x] **Step 2: Run targeted tests to confirm failure**
Run: `pnpm test:unit -- src/nostr-overlay/components/NotificationsDialog.test.tsx -t "unread"`
Expected: FAIL.

- [x] **Step 3: Implement notifications query + realtime subscription bridge**
Use query for initial load and subscription callback to patch cache via `setQueryData`.

- [x] **Step 4: Replace unread heuristic in App**
Remove `hasMoreFeed && items.length > 0`-style approximations; use read-state timestamps.

- [x] **Step 5: Delete legacy notifications hook and tests**
Delete old store-based implementation immediately after integration.

- [x] **Step 6: Re-run tests**
Run: `pnpm test:unit -- src/nostr-overlay/components/NotificationsDialog.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**
`git commit -m "refactor: migrate social notifications to tanstack query with realtime cache updates"`

---

## Chunk 5: Direct Messages Migration to Query

### Task 5: Replace DM store, remove manual version bumping in App

**Files:**
- Create: `src/nostr-overlay/query/direct-messages.query.ts`
- Create: `src/nostr-overlay/query/dm-storage.ts`
- Modify: `src/nostr-overlay/hooks/useNostrOverlay.ts`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/ChatDialog.tsx`
- Modify: `src/nostr-overlay/components/ChatDialog.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Delete: `src/nostr-overlay/hooks/useDirectMessages.ts`
- Delete: `src/nostr-overlay/hooks/useDirectMessages.test.ts`

- [x] **Step 1: Add failing tests for chat state without manual `chatStateVersion`**
Assert conversation list/detail updates from query cache and subscription events.

- [x] **Step 2: Run targeted tests to confirm failure**
Run: `pnpm test:unit -- src/nostr-overlay/components/ChatDialog.test.tsx -t "query"`
Expected: FAIL.

- [x] **Step 3: Implement DM queries + send mutation**
Add bootstrap query, conversation query, realtime ingest, optimistic send state (`pending` -> `sent`/`failed`).

- [x] **Step 4: Remove imperative chat synchronization in App**
Delete manual subscription path and local version ticks in `App.tsx`.

- [x] **Step 5: Update `useNostrOverlay` contract**
Stop returning DM store object; expose only data/services needed by query layer.

- [x] **Step 6: Delete legacy DM store files**
Delete `useDirectMessages.ts` and tests in the same phase.

- [x] **Step 7: Re-run tests**
Run: `pnpm test:unit -- src/nostr-overlay/components/ChatDialog.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**
`git commit -m "refactor: migrate direct messages state to tanstack query and remove manual app syncing"`

---

## Chunk 6: Legacy Cleanup, Dead Code Removal, and Hard Verification

### Task 6: Remove unused feed dialog and enforce no-legacy gate

**Files:**
- Delete: `src/nostr-overlay/components/FollowingFeedDialog.tsx`
- Delete: `src/nostr-overlay/components/FollowingFeedDialog.test.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `tsconfig.json` (if path cleanup needed)

- [x] **Step 1: Delete dead component and related tests**
Remove `FollowingFeedDialog` artifacts no longer used by routed surface architecture.

- [x] **Step 2: Add no-legacy guard checks**
Add CI-friendly grep checks (or test assertions) that fail if these symbols exist:
- `useFollowingFeed(`
- `useSocialNotifications(`
- `useDirectMessages(`
- `chatStateVersion`
- `FollowingFeedDialog`

- [x] **Step 3: Run complete validation**
Run:
`pnpm typecheck && pnpm test:unit && pnpm build`
Expected: PASS.

- [x] **Step 4: Verify no legacy references remain**
Run:
`rg "useFollowingFeed\(|useSocialNotifications\(|useDirectMessages\(|chatStateVersion|FollowingFeedDialog" src/nostr-overlay`
Expected: no matches.

- [ ] **Step 5: Final commit**
`git commit -m "chore: remove legacy social state paths after tanstack query migration"`

---

## Final Exit Criteria

- Social features use TanStack Query as single server-state source.
- No store-style social hooks remain (`useFollowingFeed`, `useSocialNotifications`, `useDirectMessages`).
- `App` no longer performs manual social store subscriptions/version bumping.
- All tests/typecheck/build pass.
- Repo contains no dead social overlay components tied to prior architecture.

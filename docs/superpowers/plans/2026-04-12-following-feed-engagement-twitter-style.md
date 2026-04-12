# Following Feed Engagement + Author Metadata Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en el feed avatar/nombre del autor, fecha-hora de publicacion y metricas tipo Twitter (respuestas, reacciones, reposts, zaps) usando iconos con contador.

**Architecture:** Extenderemos el pipeline del feed para hidratar metricas por `eventId` (kind 1/6/7/9735) y las renderizaremos junto al contenido. El store de `useFollowingFeed` mantendra `engagementByEventId` y hara actualizaciones optimistas para reaccion/repost/respuesta. La UI reutiliza perfiles ya cargados en `App` para avatar y nombre.

**Tech Stack:** React 19, TypeScript, Nostr (NDK transport), Lucide icons, Vitest.

---

## Chunk 1: Metrics Model + Runtime Aggregation

### Task 1: Add engagement model and runtime loader

**Files:**
- Modify: `src/nostr/social-feed-service.ts`
- Modify: `src/nostr/social-feed-runtime-service.ts`
- Modify: `src/nostr/social-feed-runtime-service.test.ts`

- [ ] **Step 1: Write failing tests for aggregation**
Add tests in `src/nostr/social-feed-runtime-service.test.ts` validating:
1) counts by event id for replies/reposts/reactions/zaps,
2) ignores invalid events/duplicates,
3) maps by target `eventId`.

- [ ] **Step 2: Run targeted test to confirm failure**
Run: `pnpm test:unit -- src/nostr/social-feed-runtime-service.test.ts -t "engagement"`
Expected: FAIL (API/method does not exist).

- [ ] **Step 3: Extend feed service contracts**
In `src/nostr/social-feed-service.ts`, add:
- `SocialEngagementMetrics` (`replies`, `reposts`, `reactions`, `zaps`)
- `LoadEngagementInput` (`eventIds`, optional `until`, `limit`)
- `loadEngagement(input): Promise<Record<string, SocialEngagementMetrics>>` to `SocialFeedService`.

- [ ] **Step 4: Implement runtime metrics query**
In `src/nostr/social-feed-runtime-service.ts`, implement `loadEngagement`:
- query kinds `[1, 6, 7, 9735]` with `#e: eventIds`,
- dedupe by event id,
- classify by kind,
- resolve target with existing `extractTargetEventId`,
- increment counters per target event id,
- return default zeroed structure only for requested ids.

- [ ] **Step 5: Re-run tests**
Run: `pnpm test:unit -- src/nostr/social-feed-runtime-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**
`git commit -m "feat: add social feed engagement aggregation by event id"`

---

## Chunk 2: Store Integration + Optimistic Counters

### Task 2: Hydrate engagement in following feed store

**Files:**
- Modify: `src/nostr-overlay/hooks/useFollowingFeed.ts`
- Modify: `src/nostr-overlay/hooks/useFollowingFeed.test.ts`

- [ ] **Step 1: Write failing store tests**
Add tests in `src/nostr-overlay/hooks/useFollowingFeed.test.ts` for:
1) engagement map is hydrated after `openDialog`,
2) engagement updates after `openThread/loadNextThreadPage`,
3) optimistic increments/decrements on reaction/repost/reply.

- [ ] **Step 2: Run targeted test to confirm failure**
Run: `pnpm test:unit -- src/nostr-overlay/hooks/useFollowingFeed.test.ts -t "engagement"`
Expected: FAIL.

- [ ] **Step 3: Extend store state**
In `useFollowingFeed.ts`, add:
- `engagementByEventId: Record<string, SocialEngagementMetrics>`
- helpers:
  - `mergeEngagementByEventId(...)`
  - `ensureEngagementDefaults(eventIds)`
  - `hydrateEngagement(eventIds)`.

- [ ] **Step 4: Wire hydration points**
Call `hydrateEngagement` after:
- feed page load,
- thread open/load-more,
- successful publish operations when applicable.

- [ ] **Step 5: Apply optimistic metric updates**
- `toggleReaction`: `reactions +/- 1` with rollback on failure.
- `toggleRepost`: `reposts +/- 1` with rollback on failure.
- `publishReply`: increment `replies` on success (or optimistic + rollback if error path chosen).

- [ ] **Step 6: Re-run tests**
Run: `pnpm test:unit -- src/nostr-overlay/hooks/useFollowingFeed.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**
`git commit -m "feat: hydrate following feed engagement state with optimistic counters"`

---

## Chunk 3: Feed UI (Avatar + Name + Time + Icon Actions)

### Task 3: Render twitter-style action row and author metadata

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedDialog.tsx`
- Modify: `src/nostr-overlay/styles.css`
- Modify: `src/nostr-overlay/components/FollowingFeedDialog.test.tsx`
- Modify: `src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write failing component tests**
Add/adjust tests to verify:
1) author name and avatar fallback are visible,
2) `<time>` with local formatted datetime appears,
3) action row renders counts for reply/reaction/repost/zap,
4) clicking icon actions triggers existing handlers.

- [ ] **Step 2: Run component tests to confirm failure**
Run: `pnpm test:unit -- src/nostr-overlay/components/FollowingFeedDialog.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Pass profile and engagement props from App**
In `src/nostr-overlay/App.tsx`:
- build `feedProfilesByPubkey` from `overlay.profiles`, `overlay.followerProfiles`, and owner profile,
- pass `profilesByPubkey` + `engagementByEventId` to feed components.

- [ ] **Step 4: Update FollowingFeedContent rendering**
In `FollowingFeedContent.tsx`:
- use `Avatar` component for author avatar/fallback,
- show resolved name (`displayName`, `name`, fallback short pubkey),
- render timestamp with `<time dateTime=...>{localized}</time>`,
- replace textual action buttons with icon + counter controls:
  - Reply (opens thread/reply target),
  - Reaction toggle,
  - Repost toggle,
  - Zap count indicator (read-only).
- preserve accessibility with `aria-label` per action.

- [ ] **Step 5: Add styles**
In `styles.css`, add classes for:
- card header (avatar/name/time),
- compact action row,
- active/pending action states,
- small counter typography responsive for mobile.

- [ ] **Step 6: Re-run UI tests**
Run: `pnpm test:unit -- src/nostr-overlay/components/FollowingFeedDialog.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**
`git commit -m "feat: show author identity, timestamp, and icon engagement counters in following feed"`

---

## Chunk 4: Regression Verification

### Task 4: Full validation and cleanup

**Files:**
- Modify (if needed): `src/nostr-overlay/components/FollowingFeedContent.tsx`
- Modify (if needed): `src/nostr-overlay/hooks/useFollowingFeed.ts`
- Modify (if needed): tests above

- [ ] **Step 1: Run focused suite**
Run:
`pnpm test:unit -- src/nostr/social-feed-runtime-service.test.ts src/nostr-overlay/hooks/useFollowingFeed.test.ts src/nostr-overlay/components/FollowingFeedDialog.test.tsx src/nostr-overlay/components/FollowingFeedSurface.test.tsx src/nostr-overlay/App.test.tsx`

- [ ] **Step 2: Run full unit tests**
Run: `pnpm test:unit`

- [ ] **Step 3: Run typecheck and build**
Run: `pnpm typecheck && pnpm build`

- [ ] **Step 4: Final commit if needed**
`git commit -m "test: cover following feed engagement and metadata regressions"`

---

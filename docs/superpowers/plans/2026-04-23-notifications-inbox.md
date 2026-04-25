# Notifications Inbox Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the overlay notifications screen into a richer inbox with `Nuevas` and `Recientes`, grouped reactions and zaps, note previews, actor identity, and minimal protocol expansion to support repost `kind 16`.

**Architecture:** Keep notifications ingestion as raw events from the existing BFF/runtime/query flow and add a pure inbox normalization layer that classifies, groups, and prepares render-ready items. Hydrate missing actors and target events in batch via the overlay services already used elsewhere, then render the inbox with existing `shadcn/ui` primitives and Tailwind layout utilities while minimizing custom CSS.

**Tech Stack:** React 19, TypeScript, Fastify, TanStack Query, Vite, Vitest, shadcn/ui `radix-nova`, Tailwind CSS v4, lucide-react.

---

## File Structure

- **Create:** `src/nostr-overlay/query/social-notifications-inbox.ts`
  - Pure transformation layer from raw social notifications to grouped inbox sections/items.
- **Create:** `src/nostr-overlay/query/social-notifications-inbox.test.ts`
  - Unit coverage for classification, grouping, dedupe, and section splitting.
- **Modify:** `server/src/modules/notifications/notifications.service.ts`
  - Extend notification kinds to include repost `kind 16`.
- **Modify:** `server/src/modules/notifications/notifications.service.test.ts`
  - Lock backend list/stream behavior for `kind 16`.
- **Modify:** `src/nostr/social-notifications-service.ts`
  - Extend raw notification kind typing/helpers.
- **Modify:** `src/nostr/social-notifications-runtime-service.ts`
  - Accept `kind 16` in runtime relay subscription and bootstrap loading.
- **Modify:** `src/nostr-overlay/query/social-notifications.query.ts`
  - Keep raw notification collections but include `kind 16` and leave the UI semantics to the inbox layer.
- **Modify:** `src/nostr-overlay/App.tsx`
  - Pass both raw collections plus profile/event hydration hooks into the notifications page.
- **Modify:** `src/nostr-overlay/App.test.tsx`
  - Update route wiring and hydration expectations.
- **Modify:** `src/nostr-overlay/components/NotificationsPage.tsx`
  - Build the final inbox UI using `OverlaySurface`, `OverlayPageHeader`, `Item`, `Badge`, `Avatar`/`VerifiedUserAvatar`, and `NoteCard` preview composition.
- **Modify:** `src/nostr-overlay/components/NotificationsPage.test.tsx`
  - Cover sections, grouped rows, fallbacks, and enriched rendering.
- **Modify:** `src/i18n/messages/es.ts`
- **Modify:** `src/i18n/messages/en.ts`
  - Add all user-facing copy for inbox sections and row variants.

## Chunk 1: Expand the raw notification contract

**Suggested skills:** `@nostr-specialist`, `@nodejs-backend-patterns`, `@vitest`

### Task 1: Add repost `kind 16` support across backend and runtime ingestion

**Files:**
- Modify: `server/src/modules/notifications/notifications.service.ts`
- Modify: `server/src/modules/notifications/notifications.service.test.ts`
- Modify: `src/nostr/social-notifications-service.ts`
- Modify: `src/nostr/social-notifications-runtime-service.ts`
- Modify: `src/nostr-overlay/query/social-notifications.query.ts`

- [ ] **Step 1: Write the failing backend tests for `kind 16`**

Add or extend tests in `server/src/modules/notifications/notifications.service.test.ts` so list and stream both include a `kind: 16` event when it has the owner's `#p` tag.

- [ ] **Step 2: Run the backend test to verify the failure**

Run: `pnpm test:unit:backend -- server/src/modules/notifications/notifications.service.test.ts`

Expected: FAIL because `NOTIFICATION_KINDS` still excludes `16`.

- [ ] **Step 3: Extend backend notification kinds**

Update `server/src/modules/notifications/notifications.service.ts`:

```ts
const NOTIFICATION_KINDS = [1, 6, 7, 16, 9735]
```

Keep the rest of the DTO contract unchanged in this task.

- [ ] **Step 4: Extend frontend/runtime raw kind support**

Update `src/nostr/social-notifications-service.ts`, `src/nostr/social-notifications-runtime-service.ts`, and `src/nostr-overlay/query/social-notifications.query.ts` so the runtime subscription, bootstrap load, and raw item mapping all accept `16`.

- [ ] **Step 5: Re-run the targeted backend test**

Run: `pnpm test:unit:backend -- server/src/modules/notifications/notifications.service.test.ts`

Expected: PASS with `kind 16` included in list and stream behavior.

- [ ] **Step 6: Re-run the targeted frontend query test coverage if needed**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/query/query-standards.test.ts`

Expected: PASS and no regression in the query standards contract.

## Chunk 2: Build the pure inbox normalization layer

**Suggested skills:** `@nostr-specialist`, `@typescript-advanced-types`, `@vitest`

### Task 2: Create a pure grouped inbox model

**Files:**
- Create: `src/nostr-overlay/query/social-notifications-inbox.ts`
- Create: `src/nostr-overlay/query/social-notifications-inbox.test.ts`

- [ ] **Step 1: Write failing unit tests for classification and grouping**

Add tests for these cases:

- `kind 9735` grouped by `targetEventId` and sums sats
- `kind 7` grouped by `targetEventId + reactionContent`
- `kind 6` and `kind 16` grouped as repost rows
- `kind 1` falls back conservatively to `mention` unless reply evidence is strong
- `Recientes` excludes event IDs already present in `Nuevas`

- [ ] **Step 2: Run the new unit test file to verify failure**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/query/social-notifications-inbox.test.ts`

Expected: FAIL because the new transformation layer does not exist yet.

- [ ] **Step 3: Implement the inbox types and pure helpers**

Create `social-notifications-inbox.ts` with:

- `NotificationCategory`
- `NotificationActor`
- `NotificationInboxItem`
- `NotificationInboxSections`
- helpers for grouping keys, actor dedupe, and conservative classification

- [ ] **Step 4: Keep protocol handling conservative**

Implement rules that:

- preserve real reaction content instead of normalizing everything to `like`
- treat `kind 1` as `reply` only when the tag evidence is clear enough
- fall back to `mention` when reply detection is ambiguous
- support zaps with no reliable sender identity

- [ ] **Step 5: Re-run the unit tests**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/query/social-notifications-inbox.test.ts`

Expected: PASS with stable grouping and section behavior.

## Chunk 3: Wire hydration into the notifications route

**Suggested skills:** `@senior-frontend`, `@nostr-specialist`, `@vitest`

### Task 3: Pass the raw collections and hydration services into the page

**Files:**
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Write or update a failing route test**

Extend `src/nostr-overlay/App.test.tsx` so the notifications route asserts the page receives enough data to build both sections and resolve missing actors/targets.

- [ ] **Step 2: Run the targeted app test to verify failure**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/App.test.tsx`

Expected: FAIL because `NotificationsPage` still receives only `hasUnread` and `pendingSnapshot`.

- [ ] **Step 3: Extend the route props passed to `NotificationsPage`**

Update `src/nostr-overlay/App.tsx` so the `/notificaciones` route passes:

- `hasUnread`
- `newNotifications={socialState.pendingSnapshot}`
- `recentNotifications={socialState.items}`
- `profilesByPubkey={overlay.profiles}`
- `eventReferencesById={eventReferencesById}`
- `onResolveProfiles={overlay.loadProfilesByPubkeys}`
- `onResolveEventReferences={resolveEventReferences}`

- [ ] **Step 4: Re-run the app test**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/App.test.tsx`

Expected: PASS with the route wiring updated.

## Chunk 4: Render the inbox with shadcn and Tailwind composition

**Suggested skills:** `@shadcn`, `@tailwind-css-patterns`, `@senior-frontend`, `@accessibility`

### Task 4: Rebuild `NotificationsPage` around grouped inbox sections

**Files:**
- Modify: `src/nostr-overlay/components/NotificationsPage.tsx`
- Modify: `src/nostr-overlay/components/NotificationsPage.test.tsx`

- [ ] **Step 1: Write failing component tests for the enriched UI**

Add tests covering:

- `Nuevas` and `Recientes` section headings
- grouped zap row with total sats
- grouped reaction row with the reaction preserved
- repost row for `kind 16`
- mention/reply row fallbacks
- target preview rendering when the referenced note is available
- graceful rendering when the target is missing

- [ ] **Step 2: Run the component test file to verify failure**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/components/NotificationsPage.test.tsx`

Expected: FAIL because the component still renders a flat list of `kind` label + truncated pubkey.

- [ ] **Step 3: Build the page around existing primitives**

Refactor `NotificationsPage.tsx` to:

- keep `OverlaySurface` and `OverlayPageHeader`
- use `Empty` for the empty state
- use `Item` rows for inbox entries
- use `Badge` for sats and grouped counts when useful
- use `Avatar` or `VerifiedUserAvatar` for actors
- reuse `NoteCard` for target preview via `fromResolvedReferenceEvent` and `withoutNoteActions`

- [ ] **Step 4: Keep styling utility-first and minimal**

Use Tailwind only for layout and spacing, for example:

- `flex`
- `grid`
- `gap-*`
- `items-*`
- `justify-*`
- `truncate`
- `min-h-0`

Do not introduce hardcoded colors or large custom CSS selectors unless execution proves a tiny gap the primitives cannot cover.

- [ ] **Step 5: Re-run the component tests**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/components/NotificationsPage.test.tsx`

Expected: PASS with the new grouped section UI.

## Chunk 5: Add i18n copy and fallbacks

**Suggested skills:** `@vitest`, `@shadcn`

### Task 5: Add all user-facing copy through i18n

**Files:**
- Modify: `src/i18n/messages/es.ts`
- Modify: `src/i18n/messages/en.ts`
- Modify: `src/nostr-overlay/components/NotificationsPage.test.tsx`

- [ ] **Step 1: Add failing assertions for the new copy keys**

Extend `NotificationsPage.test.tsx` to assert both Spanish and English render the new section headings and key row labels.

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/components/NotificationsPage.test.tsx`

Expected: FAIL because the new keys do not exist yet.

- [ ] **Step 3: Add the new translation keys**

Add keys for at least:

- `notifications.section.new`
- `notifications.section.recent`
- `notifications.category.reply`
- `notifications.category.mention`
- `notifications.actor.anonymous`
- `notifications.target.unavailable`
- grouped row copy for `zap`, `reaction`, and `repost`

- [ ] **Step 4: Re-run the component tests**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/components/NotificationsPage.test.tsx`

Expected: PASS in both locales.

## Chunk 6: Final verification

**Suggested skills:** `@vitest`, `@verification-before-completion`

### Task 6: Run focused verification for backend, query, app, and component layers

**Files:**
- No new files expected

- [ ] **Step 1: Run the frontend unit tests for the notifications flow**

Run: `pnpm test:unit:frontend -- src/nostr-overlay/query/social-notifications-inbox.test.ts src/nostr-overlay/components/NotificationsPage.test.tsx src/nostr-overlay/App.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run the backend unit test for notifications service**

Run: `pnpm test:unit:backend -- server/src/modules/notifications/notifications.service.test.ts`

Expected: PASS.

- [ ] **Step 3: Run lint for frontend files**

Run: `pnpm lint:frontend`

Expected: PASS.

- [ ] **Step 4: Run full typecheck**

Run: `pnpm typecheck:frontend && pnpm typecheck:server`

Expected: PASS.

- [ ] **Step 5: Manually verify the inbox behavior**

Check that:

- `Nuevas` and `Recientes` render in the right order
- `Recientes` does not duplicate `Nuevas`
- zaps show grouped total sats
- reactions group by note and reaction content
- repost `kind 16` appears correctly
- missing actors and targets fall back gracefully
- the page stays visually consistent with the rest of the overlay
- no unnecessary custom styles were introduced

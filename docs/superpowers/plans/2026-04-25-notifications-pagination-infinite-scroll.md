# Notifications Pagination And Infinite Scroll Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load notifications incrementally so the page starts with a small recent slice and fetches older notifications as the user scrolls, improving initial render and network performance.

**Architecture:** Preserve the existing server pagination contract (`limit`, `since`, `hasMore`, `nextSince`) and expose it through the frontend notification service instead of discarding pagination metadata. Replace the single large bootstrap query with an incremental controller that keeps loaded pages in memory, merges realtime notifications at the top, and rebuilds grouped inbox sections from all loaded items.

**Tech Stack:** React 19, TypeScript, TanStack Query, existing Nostr BFF `/v1/notifications`, Fastify, shadcn/ui `Spinner`/`Button` if a manual fallback is needed, Vitest.

---

## Chunk 1: Service Contract For Paged Notifications

Recommended skills: @test-driven-development, @nodejs-backend-patterns, @verification-before-completion.

### Files

- Modify: `src/nostr/social-notifications-service.ts`
- Modify: `src/nostr-api/social-notifications-api-service.ts`
- Modify: `src/nostr-api/social-notifications-api-service.test.ts`
- Modify: `src/nostr/social-notifications-runtime-service.ts`
- Modify: `src/nostr/social-notifications-runtime-service.test.ts`
- Reference: `server/src/modules/notifications/notifications.schemas.ts`
- Reference: `server/src/modules/notifications/notifications.service.ts`

### Task 1: Add A Paged Result Type Without Breaking Callers

- [ ] **Step 1: Write the failing API-service test**

In `src/nostr-api/social-notifications-api-service.test.ts`, add a test for a new paged method.

```ts
test('loads a social notifications page with cursor metadata', async () => {
    const request = vi.fn(async () => ({
        items: [{
            id: 'a'.repeat(64),
            kind: 7,
            actorPubkey: '1'.repeat(64),
            createdAt: 100,
            targetEventId: 'b'.repeat(64),
            targetPubkey: 'c'.repeat(64),
            rawEvent: {
                id: 'a'.repeat(64),
                pubkey: '1'.repeat(64),
                kind: 7,
                createdAt: 100,
                tags: [['p', 'c'.repeat(64)], ['e', 'b'.repeat(64)]],
                content: '+',
            },
        }],
        hasMore: true,
        nextSince: 99,
    }));
    const service = createSocialNotificationsApiService({ client: { getJson: request } as any });

    const result = await service.loadSocialPage({ ownerPubkey: 'c'.repeat(64), limit: 20, since: 123 });

    expect(request).toHaveBeenCalledWith('/notifications', {
        includeAuth: true,
        query: { ownerPubkey: 'c'.repeat(64), limit: 20, since: 123 },
    });
    expect(result.hasMore).toBe(true);
    expect(result.nextSince).toBe(99);
    expect(result.events[0]?.id).toBe('a'.repeat(64));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-api/social-notifications-api-service.test.ts --testNamePattern "loads a social notifications page"`

Expected: FAIL because `loadSocialPage` does not exist.

- [ ] **Step 3: Add the interface and API implementation**

In `src/nostr/social-notifications-service.ts`, add:

```ts
export interface SocialNotificationsPage {
    events: SocialNotificationEvent[];
    hasMore: boolean;
    nextSince: number | null;
}
```

Extend `SocialNotificationsService`:

```ts
loadSocialPage(input: {
    ownerPubkey: string;
    limit?: number;
    since?: number;
}): Promise<SocialNotificationsPage>;
```

Keep `loadInitialSocial` for compatibility during this chunk.

In `src/nostr-api/social-notifications-api-service.ts`, implement `loadSocialPage` by returning `{ events, hasMore, nextSince }`. Then rewrite `loadInitialSocial` to call `loadSocialPage` and return `page.events`.

- [ ] **Step 4: Add runtime implementation**

In `src/nostr/social-notifications-runtime-service.ts`, add `loadSocialPage`. It can wrap the existing relay query result:

```ts
const events = await loadInitialSocial(input);
return { events, hasMore: false, nextSince: null };
```

This runtime fallback does not have reliable relay page metadata yet, so the BFF-backed API is the source of true pagination.

- [ ] **Step 5: Run focused service tests**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-api/social-notifications-api-service.test.ts src/nostr/social-notifications-runtime-service.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/nostr/social-notifications-service.ts src/nostr-api/social-notifications-api-service.ts src/nostr-api/social-notifications-api-service.test.ts src/nostr/social-notifications-runtime-service.ts src/nostr/social-notifications-runtime-service.test.ts
git commit -m "feat(notifications): expose paged social notification loading"
```

## Chunk 2: Incremental Notifications Controller

Recommended skills: @test-driven-development, @react-best-practices, @verification-before-completion.

### Files

- Modify: `src/nostr-overlay/query/social-notifications.query.ts`
- Modify: `src/nostr-overlay/query/keys.ts`
- Modify: `src/nostr-overlay/query/types.ts`
- Modify: `src/nostr-overlay/query/social-notifications.query.test.ts` if present; otherwise create `src/nostr-overlay/query/social-notifications.query.test.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Reference: `src/nostr-overlay/query/social-notifications-inbox.ts`

### Task 2: Return Pagination State From `useSocialNotificationsController`

- [ ] **Step 1: Write the failing controller test**

If `src/nostr-overlay/query/social-notifications.query.test.tsx` does not exist, create it with the existing React test style. Test the hook through a small harness component.

```tsx
test('loads the first notifications page with a small page size and exposes more state', async () => {
    const service: SocialNotificationsService = {
        subscribeSocial: vi.fn(() => () => {}),
        loadInitialSocial: vi.fn(async () => []),
        loadSocialPage: vi.fn(async () => ({
            events: [buildEvent({ id: 'a'.repeat(64), created_at: 100 })],
            hasMore: true,
            nextSince: 99,
        })),
    };

    const rendered = await renderController({ ownerPubkey: 'c'.repeat(64), service, pageSize: 20 });

    await waitFor(() => rendered.textContent.includes('items:1'));
    expect(service.loadSocialPage).toHaveBeenCalledWith({ ownerPubkey: 'c'.repeat(64), limit: 20, since: expect.any(Number) });
    expect(rendered.textContent).toContain('hasMore:true');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/query/social-notifications.query.test.tsx --testNamePattern "loads the first notifications page"`

Expected: FAIL because controller currently calls `loadInitialSocial` once and does not expose pagination state.

- [ ] **Step 3: Update types and query key naming**

In `src/nostr-overlay/query/types.ts`, rename `limit` intent to `pageSize` while keeping `since` optional.

```ts
export interface NotificationsQueryInput {
    ownerPubkey: string;
    pageSize?: number;
    since?: number;
}
```

In `src/nostr-overlay/query/keys.ts`, use `pageSize: input.pageSize ?? 30` in `notifications` keys.

Update `src/nostr-overlay/query/query-standards.test.ts` if it asserts the key shape.

- [ ] **Step 4: Add controller state and methods**

In `src/nostr-overlay/query/social-notifications.query.ts`, change constants:

```ts
const SOCIAL_NOTIFICATIONS_PAGE_SIZE = 30;
const SOCIAL_NOTIFICATIONS_MAX_ITEMS = 200;
```

Extend options and state:

```ts
pageSize?: number;
```

```ts
hasMore: boolean;
isLoadingMore: boolean;
loadMore: () => Promise<void>;
```

Use `service.loadSocialPage` in the bootstrap query. Store a query data shape such as:

```ts
interface SocialNotificationsLoadedState {
    items: SocialNotificationItem[];
    hasMore: boolean;
    nextSince: number | null;
}
```

Use the page response metadata instead of slicing to `maxItems` as the only pagination control.

- [ ] **Step 5: Implement deduped page merge**

Add a helper in `src/nostr-overlay/query/social-notifications.query.ts`.

```ts
function mergeNotificationItems(current: SocialNotificationItem[], next: SocialNotificationItem[], maxItems: number): SocialNotificationItem[] {
    const byId = new Map<string, SocialNotificationItem>();
    for (const item of [...current, ...next]) {
        byId.set(item.id, item);
    }
    return sortItems([...byId.values()]).slice(0, maxItems);
}
```

Use it for both realtime upserts and older page appends.

- [ ] **Step 6: Implement `loadMore`**

Use current query data `nextSince`. Guard against duplicate calls while loading.

```ts
const loadMore = useCallback(async () => {
    const current = queryClient.getQueryData<SocialNotificationsLoadedState>(queryKey);
    if (!options.ownerPubkey || !current?.hasMore || current.nextSince === null || isLoadingMoreRef.current) {
        return;
    }

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
        const page = await options.service.loadSocialPage({
            ownerPubkey: options.ownerPubkey,
            limit: pageSize,
            since: current.nextSince,
        });
        const nextItems = page.events
            .filter((event) => shouldIncludeEvent(event, options.ownerPubkey!))
            .map(toItem)
            .filter((item): item is SocialNotificationItem => Boolean(item));
        queryClient.setQueryData<SocialNotificationsLoadedState>(queryKey, {
            items: mergeNotificationItems(current.items, nextItems, maxItems),
            hasMore: page.hasMore,
            nextSince: page.nextSince,
        });
    } finally {
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
    }
}, [maxItems, options.ownerPubkey, options.service, pageSize, queryClient, queryKey]);
```

- [ ] **Step 7: Run controller tests**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/query/social-notifications.query.test.tsx src/nostr-overlay/query/query-standards.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/nostr-overlay/query/social-notifications.query.ts src/nostr-overlay/query/keys.ts src/nostr-overlay/query/types.ts src/nostr-overlay/query/query-standards.test.ts src/nostr-overlay/query/social-notifications.query.test.tsx
git commit -m "feat(notifications): load notification pages incrementally"
```

## Chunk 3: Infinite Scroll UI

Recommended skills: @test-driven-development, @frontend-design, @shadcn, @accessibility, @verification-before-completion.

### Files

- Modify: `src/nostr-overlay/components/NotificationsPage.tsx`
- Modify: `src/nostr-overlay/components/NotificationsPage.test.tsx`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`
- Modify: `src/i18n/messages/es.ts`
- Modify: `src/i18n/messages/en.ts`
- Reference: `src/components/ui/spinner.tsx`
- Reference: `src/nostr-overlay/components/FollowingFeedSurface.tsx`

### Task 3: Add Load-More Props And Footer State

- [ ] **Step 1: Add i18n keys first**

Add keys to `src/i18n/messages/es.ts` and `src/i18n/messages/en.ts`.

```ts
// es
'notifications.pagination.loadingMore': 'Cargando notificaciones...',
'notifications.pagination.loadMore': 'Cargar mas notificaciones',
'notifications.pagination.end': 'No hay mas notificaciones.',
```

```ts
// en
'notifications.pagination.loadingMore': 'Loading notifications...',
'notifications.pagination.loadMore': 'Load more notifications',
'notifications.pagination.end': 'No more notifications.',
```

- [ ] **Step 2: Write failing UI test for loading more footer**

In `src/nostr-overlay/components/NotificationsPage.test.tsx`:

```tsx
test('renders load-more footer and calls onLoadMore when requested', async () => {
    const onLoadMore = vi.fn(async () => {});
    const rendered = await renderElement(
        <NotificationsPage
            hasUnread={false}
            newNotifications={[buildItem()]}
            recentNotifications={[]}
            profilesByPubkey={{}}
            eventReferencesById={{}}
            hasMoreNotifications
            isLoadingMoreNotifications={false}
            onLoadMoreNotifications={onLoadMore}
        />,
    );
    mounted.push(rendered);

    const button = Array.from(rendered.container.querySelectorAll('button')).find((node) => node.textContent?.includes('Cargar mas notificaciones')) as HTMLButtonElement | undefined;
    expect(button).toBeDefined();

    await act(async () => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "load-more footer"`

Expected: FAIL because `NotificationsPage` has no pagination props.

- [ ] **Step 4: Implement props and footer**

Extend `NotificationsPageProps` in `src/nostr-overlay/components/NotificationsPage.tsx`.

```tsx
hasMoreNotifications?: boolean;
isLoadingMoreNotifications?: boolean;
onLoadMoreNotifications?: () => Promise<void> | void;
```

Import `Button` and `Spinner`.

```tsx
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
```

Render a footer after the sections inside the scrollable list.

```tsx
{hasMoreNotifications && onLoadMoreNotifications ? (
    <div className="flex justify-center py-2">
        <Button type="button" variant="outline" size="sm" disabled={isLoadingMoreNotifications} onClick={() => void onLoadMoreNotifications()}>
            {isLoadingMoreNotifications ? (
                <>
                    <Spinner data-icon="inline-start" />
                    {t('notifications.pagination.loadingMore')}
                </>
            ) : t('notifications.pagination.loadMore')}
        </Button>
    </div>
) : !hasMoreNotifications && sections.recentItems.length > 0 ? (
    <p className="py-2 text-center text-xs text-muted-foreground">{t('notifications.pagination.end')}</p>
) : null}
```

This manual button is the accessible fallback and testable baseline before adding automatic scroll triggering.

- [ ] **Step 5: Run UI test to verify it passes**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "load-more footer"`

Expected: PASS.

- [ ] **Step 6: Wire controller state through App**

In `src/nostr-overlay/App.tsx`, pass controller fields into `NotificationsPage`:

```tsx
hasMoreNotifications={socialNotifications.hasMore}
isLoadingMoreNotifications={socialNotifications.isLoadingMore}
onLoadMoreNotifications={socialNotifications.loadMore}
```

Update `src/nostr-overlay/App.test.tsx` mocks for `useSocialNotificationsController` state if needed.

- [ ] **Step 7: Commit**

```bash
git add src/nostr-overlay/components/NotificationsPage.tsx src/nostr-overlay/components/NotificationsPage.test.tsx src/nostr-overlay/App.tsx src/nostr-overlay/App.test.tsx src/i18n/messages/es.ts src/i18n/messages/en.ts
git commit -m "feat(notifications): add incremental loading footer"
```

### Task 4: Trigger Loading Near Scroll End

- [ ] **Step 1: Write failing scroll-trigger test**

In `src/nostr-overlay/components/NotificationsPage.test.tsx`, test that scrolling near the end calls `onLoadMoreNotifications` once.

```tsx
test('loads more notifications when scrolling near the end of the list', async () => {
    const onLoadMore = vi.fn(async () => {});
    const rendered = await renderElement(
        <NotificationsPage
            hasUnread={false}
            newNotifications={[buildItem()]}
            recentNotifications={[]}
            profilesByPubkey={{}}
            eventReferencesById={{}}
            hasMoreNotifications
            isLoadingMoreNotifications={false}
            onLoadMoreNotifications={onLoadMore}
        />,
    );
    mounted.push(rendered);

    const scroller = rendered.container.querySelector('[data-slot="notifications-scroll-container"]') as HTMLElement | null;
    expect(scroller).not.toBeNull();
    Object.defineProperty(scroller, 'scrollTop', { value: 900, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(scroller, 'scrollHeight', { value: 1000, configurable: true });

    await act(async () => {
        scroller?.dispatchEvent(new Event('scroll', { bubbles: true }));
    });

    expect(onLoadMore).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "scrolling near the end"`

Expected: FAIL because no scroll handler exists.

- [ ] **Step 3: Implement guarded scroll handler**

In `src/nostr-overlay/components/NotificationsPage.tsx`, add a handler with a small threshold.

```tsx
const LOAD_MORE_SCROLL_THRESHOLD_PX = 160;

function shouldLoadMoreFromScroll(element: HTMLElement): boolean {
    return element.scrollHeight - element.scrollTop - element.clientHeight <= LOAD_MORE_SCROLL_THRESHOLD_PX;
}
```

Inside `NotificationsPage`, add:

```tsx
const loadMoreInFlightRef = useRef(false);
const handleNotificationsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMoreNotifications || isLoadingMoreNotifications || !onLoadMoreNotifications || loadMoreInFlightRef.current) {
        return;
    }

    if (!shouldLoadMoreFromScroll(event.currentTarget)) {
        return;
    }

    loadMoreInFlightRef.current = true;
    void Promise.resolve(onLoadMoreNotifications()).finally(() => {
        loadMoreInFlightRef.current = false;
    });
};
```

Attach to the scroll container and add a stable test slot:

```tsx
<div data-slot="notifications-scroll-container" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" onScroll={handleNotificationsScroll}>
```

- [ ] **Step 4: Run scroll test**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "scrolling near the end"`

Expected: PASS.

- [ ] **Step 5: Run full notification UI tests**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/nostr-overlay/components/NotificationsPage.tsx src/nostr-overlay/components/NotificationsPage.test.tsx
git commit -m "feat(notifications): load older notifications on scroll"
```

## Chunk 4: Backend Contract Verification And Final Checks

Recommended skills: @test-driven-development, @nodejs-backend-patterns, @verification-before-completion, @requesting-code-review.

### Files

- Verify: `server/src/modules/notifications/notifications.service.ts`
- Verify: `server/src/modules/notifications/notifications.service.test.ts`
- Verify: `server/src/modules/notifications/notifications.routes.test.ts`
- Verify: `src/nostr-api/social-notifications-api-service.ts`
- Verify: `src/nostr-overlay/query/social-notifications.query.ts`
- Verify: `src/nostr-overlay/components/NotificationsPage.tsx`

### Task 5: Confirm Existing BFF Pagination Is Correct For Infinite Scroll

- [ ] **Step 1: Run backend notification pagination tests**

Run: `pnpm vitest run --config vitest.config.mts --project backend server/src/modules/notifications/notifications.service.test.ts server/src/modules/notifications/notifications.routes.test.ts`

Expected: PASS. Existing tests should already cover `limit + 1`, `hasMore`, and `nextSince`.

- [ ] **Step 2: Add a route regression only if metadata is missing**

If API route tests do not assert `hasMore` and `nextSince`, add one assertion to `server/src/modules/notifications/notifications.routes.test.ts` for `/v1/notifications?ownerPubkey=...&limit=20&since=...`.

Expected response shape:

```ts
expect(payload).toEqual({
    items: expect.any(Array),
    hasMore: expect.any(Boolean),
    nextSince: expect.anything(),
});
```

- [ ] **Step 3: Run frontend focused tests**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-api/social-notifications-api-service.test.ts src/nostr-overlay/query/social-notifications.query.test.tsx src/nostr-overlay/components/NotificationsPage.test.tsx src/nostr-overlay/query/social-notifications-inbox.test.ts src/nostr-overlay/query/query-standards.test.ts`

Expected: PASS.

- [ ] **Step 4: Run lint and typecheck**

Run: `pnpm lint:frontend && pnpm lint:server && pnpm typecheck:frontend && pnpm typecheck:server`

Expected: PASS.

- [ ] **Step 5: Request code review**

Use @requesting-code-review. Review scope: pagination cursor semantics, realtime merge behavior, grouped inbox stability when older items arrive, scroll guard behavior, and API compatibility.

- [ ] **Step 6: Fix review findings and commit**

If any Critical or Important issues are found, fix them with TDD and rerun all checks above.

```bash
git add src/nostr src/nostr-api src/nostr-overlay server/src/modules/notifications src/i18n/messages/es.ts src/i18n/messages/en.ts
git commit -m "fix(notifications): address pagination review feedback"
```

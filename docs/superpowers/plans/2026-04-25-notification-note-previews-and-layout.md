# Notification Note Previews And Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve notification note layout by aligning titles with avatars, rendering mentions/replies as detached note previews, and showing referenced user notes directly in the notification feed without an inline hover layer.

**Architecture:** Keep `NotificationsPage` as the composition point, but separate the primary notification row from the note preview row for every notification that has note content. Mentions and replies render their source event as the detached preview; reactions, zaps, and reposts render the referenced target note as the detached preview. The inline word `nota` in titles becomes plain text, while clicking the visible `NoteCard` opens the corresponding note detail.

**Tech Stack:** React 19, TypeScript, TanStack Query-managed notification data, shadcn/ui `Item`, existing `NoteCard`, Vitest.

---

## Chunk 1: Layout And Reply Preview

Recommended skills: @test-driven-development, @frontend-design, @shadcn, @verification-before-completion.

### Files

- Modify: `src/nostr-overlay/components/NotificationsPage.tsx`
- Modify: `src/nostr-overlay/components/NotificationsPage.test.tsx`
- Reference: `src/components/ui/item.tsx`
- Reference: `src/nostr-overlay/components/NoteCard.tsx`

### Task 1: Center Rows Whose Note Preview Is Detached

- [ ] **Step 1: Write the failing test**

Add a test near the existing mention layout tests in `src/nostr-overlay/components/NotificationsPage.test.tsx`.

```tsx
test('centers avatar and title when a note preview is rendered below', async () => {
    const actor = '1'.repeat(64);

    const rendered = await renderElement(
        <NotificationsPage
            hasUnread={false}
            newNotifications={[
                buildItem({
                    id: 'mention-1',
                    kind: 1,
                    actorPubkey: actor,
                    content: 'te menciono en esta nota',
                    targetEventId: 'b'.repeat(64),
                    rawEvent: {
                        id: 'mention-1',
                        pubkey: actor,
                        kind: 1,
                        created_at: 100,
                        tags: [['p', 'c'.repeat(64)]],
                        content: 'te menciono en esta nota',
                    },
                }),
            ]}
            recentNotifications={[]}
            profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
            eventReferencesById={{}}
        />,
    );
    mounted.push(rendered);

    const item = rendered.container.querySelector('[data-slot="item"]') as HTMLElement | null;
    const header = rendered.container.querySelector('[data-slot="item-header"]') as HTMLElement | null;
    const itemContent = rendered.container.querySelector('[data-slot="item-content"]') as HTMLElement | null;
    const card = rendered.container.querySelector('[data-slot="card"]') as HTMLElement | null;

    expect(card).not.toBeNull();
    expect(itemContent?.contains(card)).toBe(false);
    expect(item?.className).toContain('items-center');
    expect(header?.className).toContain('items-center');
    expect(header?.className).not.toContain('items-start');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "centers avatar and title"`

Expected: FAIL because rows with a preview currently use `items-start` through `hasSecondaryContent`.

- [ ] **Step 3: Implement the minimal layout rule**

In `src/nostr-overlay/components/NotificationsPage.tsx`, derive whether the preview is rendered outside the primary content and use that to keep the main row centered.

```tsx
const rendersDetachedPreview = Boolean(targetPreview);
const shouldCenterPrimaryRow = !hasSecondaryContent || rendersDetachedPreview;
```

Apply it to both the `ItemHeader` and `Item` classes.

```tsx
<ItemHeader className={`${shouldCenterPrimaryRow ? 'items-center' : 'items-start'} gap-3`}>
```

```tsx
<Item key={item.groupKey} variant="outline" size="sm" className={shouldCenterPrimaryRow ? 'items-center' : 'items-start'}>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "centers avatar and title"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/nostr-overlay/components/NotificationsPage.tsx src/nostr-overlay/components/NotificationsPage.test.tsx
git commit -m "fix(notifications): center detached note preview rows"
```

### Task 2: Render Replies As Detached Note Previews

- [ ] **Step 1: Write the failing test**

Replace the old expectation that replies do not render a note card with a new behavior test in `src/nostr-overlay/components/NotificationsPage.test.tsx`.

```tsx
test('renders reply note preview outside the primary item content row', async () => {
    const actor = '1'.repeat(64);
    const targetEventId = 'b'.repeat(64);

    const rendered = await renderElement(
        <NotificationsPage
            hasUnread={false}
            newNotifications={[
                buildItem({
                    id: 'reply-1',
                    kind: 1,
                    actorPubkey: actor,
                    targetEventId,
                    content: 'esta es la respuesta',
                    rawEvent: {
                        id: 'reply-1',
                        pubkey: actor,
                        kind: 1,
                        created_at: 100,
                        tags: [['p', 'c'.repeat(64)], ['e', targetEventId, '', 'reply']],
                        content: 'esta es la respuesta',
                    },
                }),
            ]}
            recentNotifications={[]}
            profilesByPubkey={{ [actor]: buildProfile(actor, 'Alice') }}
            eventReferencesById={{}}
        />,
    );
    mounted.push(rendered);

    const text = rendered.container.textContent || '';
    const card = rendered.container.querySelector('[data-slot="card"]') as HTMLElement | null;
    const itemContent = rendered.container.querySelector('[data-slot="item-content"]') as HTMLElement | null;
    const header = rendered.container.querySelector('[data-slot="item-header"]') as HTMLElement | null;

    expect(text).toContain('Alice respondio a tu nota');
    expect(text).toContain('esta es la respuesta');
    expect(card).not.toBeNull();
    expect(itemContent?.contains(card)).toBe(false);
    expect(header?.className).toContain('items-center');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "renders reply note preview outside"`

Expected: FAIL because replies currently render `ItemDescription` text, not a detached `NoteCard`.

- [ ] **Step 3: Implement minimal reply preview parity with mentions**

In `src/nostr-overlay/components/NotificationsPage.tsx`, reuse `mentionOrReplySourceEvent` and `targetPreview`. For replies, stop rendering `ItemDescription` for `replyContent`; instead allow the source reply event to become the detached `NoteCard` preview just like mentions.

Use the same detached preview block for both categories.

```tsx
const shouldRenderSourcePreviewOutsideContent = (item.category === 'mention' || item.category === 'reply') && Boolean(targetPreview);
```

Update the secondary-content branch so replies no longer render the text-only description before the preview branch.

```tsx
{item.category === 'zap' ? (
    <ItemDescription>{t('notifications.meta.sats', { count: String(item.zapTotalSats ?? 0) })}</ItemDescription>
) : null}

{targetPreview && !shouldRenderSourcePreviewOutsideContent ? (...target note card...) : shouldShowUnavailable ? (...fallback...) : null}
```

Render the detached source preview after `ItemContent`.

```tsx
{shouldRenderSourcePreviewOutsideContent && targetPreview ? (
    <div className="basis-full">
        <NoteCard note={withoutNoteActions(targetPreview)} profilesByPubkey={profilesByPubkey} />
    </div>
) : null}
```

If `onOpenThread` is present, keep `data-slot="notification-open-target"` on this wrapper and keep the current click behavior.

- [ ] **Step 4: Remove or update obsolete tests**

Update these tests in `src/nostr-overlay/components/NotificationsPage.test.tsx` so they reflect the new approved behavior:

- `renders reply notifications with only the reply content instead of a full note card`
- `renders reply content as secondary text without making it interactive`

The new assertions should verify that the detached reply `NoteCard` exists, remains outside `ItemContent`, and that there is no inline `notification-target-note` button in the title.

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "reply"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/nostr-overlay/components/NotificationsPage.tsx src/nostr-overlay/components/NotificationsPage.test.tsx
git commit -m "feat(notifications): show reply notes as detached previews"
```

## Chunk 2: Referenced User Note Preview

Recommended skills: @test-driven-development, @shadcn, @frontend-design, @accessibility, @verification-before-completion.

### Files

- Modify: `src/nostr-overlay/components/NotificationsPage.tsx`
- Modify: `src/nostr-overlay/components/NotificationsPage.test.tsx`
- Reference: `src/nostr-overlay/components/NoteCard.tsx`
- Reference: `src/nostr-overlay/query/social-notifications.query.ts`

### Task 3: Render Referenced User Notes As Detached Previews

- [ ] **Step 1: Write the failing test**

Add a test to `src/nostr-overlay/components/NotificationsPage.test.tsx` proving reactions/zaps/reposts render the referenced user note outside the primary item content row.

```tsx
test('renders referenced user note preview outside the primary item content row', async () => {
    const actor = '1'.repeat(64);
    const targetAuthor = '2'.repeat(64);
    const targetEventId = 'b'.repeat(64);

    const rendered = await renderElement(
        <NotificationsPage
            hasUnread={false}
            newNotifications={[
                buildItem({
                    id: 'reaction-1',
                    kind: 7,
                    actorPubkey: actor,
                    targetEventId,
                    content: '❤️',
                    rawEvent: {
                        id: 'reaction-1',
                        pubkey: actor,
                        kind: 7,
                        created_at: 100,
                        tags: [['p', 'c'.repeat(64)], ['e', targetEventId]],
                        content: '❤️',
                    },
                }),
            ]}
            recentNotifications={[]}
            profilesByPubkey={{
                [actor]: buildProfile(actor, 'Alice'),
                [targetAuthor]: buildProfile(targetAuthor, 'Nora'),
            }}
            eventReferencesById={{ [targetEventId]: buildEvent(targetEventId, targetAuthor, 'mi nota referenciada', 80) }}
        />,
    );
    mounted.push(rendered);

    const text = rendered.container.textContent || '';
    const card = rendered.container.querySelector('[data-slot="card"]') as HTMLElement | null;
    const itemContent = rendered.container.querySelector('[data-slot="item-content"]') as HTMLElement | null;
    const noteButton = rendered.container.querySelector('[data-slot="notification-target-note"]') as HTMLElement | null;

    expect(text).toContain('Alice reacciono con ❤️ a tu nota');
    expect(text).toContain('mi nota referenciada');
    expect(card).not.toBeNull();
    expect(itemContent?.contains(card)).toBe(false);
    expect(noteButton).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "referenced user note preview"`

Expected: FAIL because target previews for reactions/zaps/reposts currently render inside `ItemContent` and the inline `nota` label is still interactive.

- [ ] **Step 3: Implement detached target note preview**

In `src/nostr-overlay/components/NotificationsPage.tsx`, introduce explicit preview variables so source previews and referenced target previews are handled separately.

```tsx
const sourcePreviewEvent = (item.category === 'mention' || item.category === 'reply')
    ? item.sourceItems[0]?.rawEvent
    : undefined;
const targetEvent = item.targetEventId ? eventReferencesById[item.targetEventId] : undefined;
const detachedPreviewEvent = sourcePreviewEvent ?? targetEvent;
const detachedPreview = detachedPreviewEvent ? fromResolvedReferenceEvent(detachedPreviewEvent) : null;
const detachedPreviewOpenEventId = detachedPreviewEvent?.id;
```

Remove the current inline target preview branch from inside `ItemContent`. Render `detachedPreview` after `ItemContent` for all categories.

```tsx
{detachedPreview ? (
    detachedPreviewOpenEventId && onOpenThread ? (
        <div
            data-slot="notification-open-target"
            className="basis-full cursor-pointer rounded-md text-left hover:bg-muted/40 focus-within:ring-[3px] focus-within:ring-ring/50"
            onClick={() => void onOpenThread(detachedPreviewOpenEventId)}
        >
            <NoteCard note={withoutNoteActions(detachedPreview)} profilesByPubkey={profilesByPubkey} />
        </div>
    ) : (
        <div className="basis-full">
            <NoteCard note={withoutNoteActions(detachedPreview)} profilesByPubkey={profilesByPubkey} />
        </div>
    )
) : null}
```

- [ ] **Step 4: Make the inline `nota` label non-interactive**

In `NotificationTitleContent`, remove the `<button data-slot="notification-target-note">` branch and always render the label as text when `notePrefix` is present.

```tsx
{notePrefix ? (
    <>
        <span>{notePrefix}</span>
        {' '}
        <span>{t('notifications.row.noteLabel')}</span>
    </>
) : (
    <span>{notificationRowSuffix(item, t)}</span>
)}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "referenced user note preview"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/nostr-overlay/components/NotificationsPage.tsx src/nostr-overlay/components/NotificationsPage.test.tsx
git commit -m "feat(notifications): show referenced notes in notification rows"
```

### Task 4: Preserve Note Detail Navigation On Visible Note Cards

- [ ] **Step 1: Write the failing navigation test**

Add a test to `src/nostr-overlay/components/NotificationsPage.test.tsx` proving the detached referenced note card opens the referenced note detail.

```tsx
test('opens the referenced note when clicking its detached notification preview', async () => {
    const actor = '1'.repeat(64);
    const targetAuthor = '2'.repeat(64);
    const targetEventId = 'b'.repeat(64);
    const onOpenThread = vi.fn();

    const rendered = await renderElement(
        <NotificationsPage
            hasUnread={false}
            newNotifications={[buildItem({ id: 'reaction-1', actorPubkey: actor, targetEventId })]}
            recentNotifications={[]}
            profilesByPubkey={{
                [actor]: buildProfile(actor, 'Alice'),
                [targetAuthor]: buildProfile(targetAuthor, 'Nora'),
            }}
            eventReferencesById={{ [targetEventId]: buildEvent(targetEventId, targetAuthor, 'mi nota referenciada', 80) }}
            onOpenThread={onOpenThread}
        />,
    );
    mounted.push(rendered);

    const openTarget = rendered.container.querySelector('[data-slot="notification-open-target"]') as HTMLDivElement | null;
    expect(openTarget).not.toBeNull();

    await act(async () => {
        openTarget?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenThread).toHaveBeenCalledWith(targetEventId);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "detached notification preview"`

Expected: FAIL until the detached preview wrapper uses the referenced event id for target-note notifications.

- [ ] **Step 3: Implement correct preview navigation ids**

For source previews (`mention` and `reply`), keep the current approved navigation behavior unless a separate product decision changes it. For referenced user-note previews (`reaction`, `zap`, `repost`), clicking the detached `NoteCard` must call `onOpenThread(item.targetEventId)`.

```tsx
const detachedPreviewOpenEventId = sourcePreviewEvent
    ? openEventId
    : item.targetEventId ?? targetEvent?.id;
```

- [ ] **Step 4: Update obsolete inline-note tests**

Update or remove tests that expect `[data-slot="notification-target-note"]` to exist. Replace them with assertions that:

- The title text still contains `nota`.
- `notification-target-note` is absent.
- The visible detached `NoteCard` opens the correct note detail.

- [ ] **Step 5: Run navigation tests**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx --testNamePattern "referenced note|inline nota|notification preview"`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/nostr-overlay/components/NotificationsPage.tsx src/nostr-overlay/components/NotificationsPage.test.tsx
git commit -m "fix(notifications): open visible referenced note previews"
```

## Chunk 3: Final Verification

Recommended skills: @verification-before-completion, @requesting-code-review.

### Files

- Verify: `src/nostr-overlay/components/NotificationsPage.tsx`
- Verify: `src/nostr-overlay/components/NotificationsPage.test.tsx`

### Task 5: Run Focused And Frontend Checks

- [ ] **Step 1: Run focused notification tests**

Run: `pnpm vitest run --config vitest.config.mts --project frontend src/nostr-overlay/components/NotificationsPage.test.tsx src/nostr-overlay/query/social-notifications-inbox.test.ts src/nostr-overlay/query/query-standards.test.ts`

Expected: PASS with all tests green.

- [ ] **Step 2: Run frontend lint**

Run: `pnpm lint:frontend`

Expected: PASS with no ESLint errors.

- [ ] **Step 3: Run frontend typecheck**

Run: `pnpm typecheck:frontend`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Request code review**

Use @requesting-code-review. Review scope: `NotificationsPage` layout, detached preview behavior, removal of inline note interaction, click-through navigation, accessibility, and tests.

- [ ] **Step 5: Fix review findings if any**

If the reviewer finds Critical or Important issues, fix them with TDD and rerun the focused checks.

- [ ] **Step 6: Commit final review fixes**

```bash
git add src/nostr-overlay/components/NotificationsPage.tsx src/nostr-overlay/components/NotificationsPage.test.tsx
git commit -m "fix(notifications): address note preview review feedback"
```

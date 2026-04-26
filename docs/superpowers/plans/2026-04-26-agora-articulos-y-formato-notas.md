# Agora Articulos Y Formato De Notas Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Articulos section under Agora in the sidebar, keep the current Agora timeline unchanged, render short notes as plaintext-rich content, and render long-form Nostr articles (`kind:30023`) with sanitized Markdown.

**Architecture:** Keep short-note and article rendering as separate paths. `kind:1` continues through `RichNostrContent` with newline preservation and lightweight Nostr enrichment; `kind:30023` gets a metadata parser, preview card, list surface, and full Markdown reader route. Routing adds `/agora/articles` and optionally `/agora/articles/:eventId`, while `/agora` remains the current social timeline.

**Tech Stack:** TypeScript, React 19, React Router, TanStack Query, shadcn/ui Sidebar/Card/Empty/Button, Tailwind CSS v4, Nostr `kind:1` and `kind:30023`, Vitest, `react-markdown`, `rehype-sanitize`.

---

## Context And Decisions

- `kind:1` is a NIP-10 plaintext short note. Do not render full Markdown or raw HTML for it.
- `kind:1` should preserve line breaks and continue rendering URLs, hashtags, profile mentions, Nostr event references, images/videos, and existing quote/reference cards.
- `kind:30023` is a NIP-23 long-form article. Its `content` should render as Markdown in the article reader.
- The existing Agora access remains unchanged: the sidebar item **Agora** opens `/agora`.
- Add a new sidebar item immediately below Agora: **Articulos**, opening `/agora/articles`.
- Do not make Agora a required collapsible group in this iteration. Use a sibling item to minimize UX churn.
- Article previews can appear in article lists and when an article is quoted/referenced from short-note contexts.
- Full Markdown rendering should only happen in the article detail route, not inline in the timeline.
- Prefer articles from followed authors for the first version. Avoid an unbounded global article feed.

---

## File Structure

### New Files

- `src/nostr/articles.ts`
  - Article constants and pure parsing helpers for NIP-23 metadata.
- `src/nostr/articles.test.ts`
  - Unit tests for article parser behavior.
- `src/nostr-overlay/components/ArticlePreviewCard.tsx`
  - Compact preview card for a `kind:30023` event.
- `src/nostr-overlay/components/ArticlePreviewCard.test.tsx`
  - Component tests for article preview metadata and fallback rendering.
- `src/nostr-overlay/components/ArticleMarkdownContent.tsx`
  - Full article reader rendering sanitized Markdown.
- `src/nostr-overlay/components/ArticleMarkdownContent.test.tsx`
  - Component tests for Markdown rendering and raw HTML safety.
- `src/nostr-overlay/components/ArticlesSurface.tsx`
  - Route surface for `/agora/articles` with loading, empty, list, refresh, and pagination UI.
- `src/nostr-overlay/components/ArticlesSurface.test.tsx`
  - Component tests for articles list states.
- `src/nostr-overlay/routes/ArticlesRouteContainer.tsx`
  - Route adapter for articles list state.
- `src/nostr-overlay/routes/ArticleDetailRouteContainer.tsx`
  - Route adapter for full article reader.
- `src/nostr-overlay/controllers/use-overlay-articles-controller.ts`
  - Controller hook for article feed query state.

### Modified Files

- `package.json` and `pnpm-lock.yaml`
  - Add `react-markdown` and `rehype-sanitize`.
- `src/nostr/social-feed-service.ts`
  - Add article feed types and service contract method.
- `src/nostr/social-feed-service.test.ts`
  - Cover article item mapping and service contract.
- `src/nostr/social-feed-runtime-service.ts`
  - Implement relay query for `kind:30023` articles.
- `src/nostr/social-feed-runtime-service.test.ts`
  - Cover article filters, pagination, and fallback behavior.
- `src/nostr-overlay/query/keys.ts`
  - Add article feed and article detail query keys.
- `src/nostr-overlay/query/following-feed.query.ts`
  - Add article feed infinite query and optional article detail query.
- `src/nostr-overlay/shell/use-overlay-route-state.ts`
  - Detect `/agora/articles` and `/agora/articles/:eventId`.
- `src/nostr-overlay/shell/use-overlay-route-state.test.tsx`
  - Cover route-state detection.
- `src/nostr-overlay/routes/OverlayRoutes.tsx`
  - Register article list/detail routes.
- `src/nostr-overlay/routes/OverlayRoutes.test.tsx`
  - Cover routing and login gate behavior for article routes.
- `src/nostr-overlay/components/OverlaySidebar.tsx`
  - Add Articulos item below Agora.
- `src/nostr-overlay/components/OverlaySidebar.test.tsx`
  - Cover sidebar order and active state.
- `src/nostr-overlay/shell/OverlaySidebarLayer.tsx`
  - Pass `onOpenArticles` into `OverlaySidebar`.
- `src/nostr-overlay/shell/OverlaySidebarLayer.test.tsx`
  - Cover prop wiring.
- `src/nostr-overlay/App.tsx`
  - Wire route state, controller, sidebar navigation, and routes props.
- `src/nostr-overlay/App.test.tsx`
  - Update sidebar order test and add articles route smoke test.
- `src/nostr-overlay/components/RichNostrContent.tsx`
  - Preserve line breaks for short notes.
- `src/nostr-overlay/components/RichNostrContent.test.tsx`
  - Cover newline preservation and no Markdown transformation for short notes.
- `src/nostr-overlay/components/note-card-model.ts`
  - Add `kindNumber` to `NoteCardModel`.
- `src/nostr-overlay/components/note-card-adapters.ts`
  - Propagate event kind into `NoteCardModel`.
- `src/nostr-overlay/components/NoteCard.tsx`
  - Render article previews for `kindNumber === 30023`.
- `src/nostr-overlay/components/NoteCard.test.tsx`
  - Cover article preview dispatch and short-note rendering.
- `src/i18n/messages/es.ts`
  - Add Spanish article/sidebar strings.
- `src/i18n/messages/en.ts`
  - Add English article/sidebar strings.

---

## Chunk 1: Article Domain Helpers

### Task 1: Add NIP-23 article parser

**Files:**
- Create: `src/nostr/articles.ts`
- Create: `src/nostr/articles.test.ts`

- [ ] **Step 1: Write parser tests**

Add tests for these cases:

```ts
import { describe, expect, test } from 'vitest';
import type { NostrEvent } from './types';
import { LONG_FORM_ARTICLE_KIND, isLongFormArticleEvent, parseArticleMetadata } from './articles';

function event(input: Partial<NostrEvent> = {}): NostrEvent {
    return {
        id: input.id ?? 'a'.repeat(64),
        pubkey: input.pubkey ?? 'b'.repeat(64),
        kind: input.kind ?? LONG_FORM_ARTICLE_KIND,
        created_at: input.created_at ?? 100,
        tags: input.tags ?? [],
        content: input.content ?? 'Article **body**',
    };
}

describe('articles', () => {
    test('identifies NIP-23 long-form articles', () => {
        expect(isLongFormArticleEvent(event())).toBe(true);
        expect(isLongFormArticleEvent(event({ kind: 1 }))).toBe(false);
    });

    test('parses article metadata tags', () => {
        const metadata = parseArticleMetadata(event({
            tags: [
                ['title', 'My article'],
                ['summary', 'Short summary'],
                ['image', 'https://example.com/cover.jpg'],
                ['published_at', '1710000000'],
                ['t', 'nostr'],
                ['t', 'maps'],
            ],
        }));

        expect(metadata).toMatchObject({
            title: 'My article',
            summary: 'Short summary',
            image: 'https://example.com/cover.jpg',
            publishedAt: 1710000000,
            topics: ['nostr', 'maps'],
        });
    });

    test('falls back to undefined metadata when tags are missing or invalid', () => {
        const metadata = parseArticleMetadata(event({
            tags: [['published_at', 'not-a-number'], ['t', '']],
        }));

        expect(metadata.title).toBeUndefined();
        expect(metadata.summary).toBeUndefined();
        expect(metadata.image).toBeUndefined();
        expect(metadata.publishedAt).toBeUndefined();
        expect(metadata.topics).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/articles.test.ts
```

Expected: FAIL because `src/nostr/articles.ts` does not exist yet.

- [ ] **Step 3: Implement article parser**

Implement:

```ts
import type { NostrEvent } from './types';

export const LONG_FORM_ARTICLE_KIND = 30023;

export interface ArticleMetadata {
    title?: string;
    summary?: string;
    image?: string;
    publishedAt?: number;
    topics: string[];
}

function firstTagValue(tags: string[][], name: string): string | undefined {
    const value = tags.find((tag) => tag[0] === name)?.[1]?.trim();
    return value ? value : undefined;
}

export function isLongFormArticleEvent(event: NostrEvent): boolean {
    return event.kind === LONG_FORM_ARTICLE_KIND;
}

export function parseArticleMetadata(event: NostrEvent): ArticleMetadata {
    const publishedAtValue = firstTagValue(event.tags, 'published_at');
    const parsedPublishedAt = publishedAtValue ? Number.parseInt(publishedAtValue, 10) : undefined;
    const topics = event.tags
        .filter((tag) => tag[0] === 't')
        .map((tag) => tag[1]?.trim().toLowerCase() ?? '')
        .filter((topic, index, allTopics) => topic.length > 0 && allTopics.indexOf(topic) === index);

    return {
        ...(firstTagValue(event.tags, 'title') ? { title: firstTagValue(event.tags, 'title') } : {}),
        ...(firstTagValue(event.tags, 'summary') ? { summary: firstTagValue(event.tags, 'summary') } : {}),
        ...(firstTagValue(event.tags, 'image') ? { image: firstTagValue(event.tags, 'image') } : {}),
        ...(Number.isFinite(parsedPublishedAt) ? { publishedAt: parsedPublishedAt } : {}),
        topics,
    };
}
```

- [ ] **Step 4: Run tests and confirm pass**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/articles.test.ts
```

Expected: PASS.

---

## Chunk 2: Feed Service Support For Articles

### Task 2: Extend social feed domain types

**Files:**
- Modify: `src/nostr/social-feed-service.ts`
- Modify: `src/nostr/social-feed-service.test.ts`

- [ ] **Step 1: Add failing tests for article feed items**

Add tests that:

- `toArticleFeedItem(kind:30023)` returns `{ kind: 'article' }`.
- `toArticleFeedItem(kind:1)` returns `null`.
- `SocialFeedService` exposes `loadArticlesFeed`.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/social-feed-service.test.ts
```

Expected: FAIL due missing article types/helpers.

- [ ] **Step 3: Implement service contract changes**

In `src/nostr/social-feed-service.ts`:

- Change `SocialFeedItemKind` to include `'article'`.
- Add `eventKind: number` to `SocialFeedItem`.
- Add `LoadArticlesFeedInput`:

```ts
export interface LoadArticlesFeedInput {
    authors: string[];
    limit?: number;
    until?: number;
}
```

- Add `loadArticlesFeed(input: LoadArticlesFeedInput): Promise<SocialFeedPage>` to `SocialFeedService`.
- Import `isLongFormArticleEvent`.
- Add:

```ts
export function toArticleFeedItem(event: NostrEvent): SocialFeedItem | null {
    if (!isLongFormArticleEvent(event)) {
        return null;
    }

    return {
        id: event.id,
        pubkey: event.pubkey,
        createdAt: event.created_at,
        content: event.content,
        kind: 'article',
        eventKind: event.kind,
        rawEvent: event,
    };
}
```

- Add `eventKind: event.kind` to `toSocialFeedItem`.

- [ ] **Step 4: Run tests and confirm pass**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/social-feed-service.test.ts
```

Expected: PASS.

---

### Task 3: Implement runtime article feed query

**Files:**
- Modify: `src/nostr/social-feed-runtime-service.ts`
- Modify: `src/nostr/social-feed-runtime-service.test.ts`

- [ ] **Step 1: Add failing runtime tests**

Add tests that verify:

- `loadArticlesFeed({ authors, limit })` calls relays with `kinds: [30023]`, `authors`, and `limit`.
- `loadArticlesFeed` returns sorted/deduped article items.
- `nextUntil` is set when there are more than `limit` items.
- Empty authors returns empty page.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/social-feed-runtime-service.test.ts
```

Expected: FAIL because `loadArticlesFeed` is not implemented.

- [ ] **Step 3: Implement runtime method**

In `src/nostr/social-feed-runtime-service.ts`:

- Import `toArticleFeedItem` and `LONG_FORM_ARTICLE_KIND`.
- Add:

```ts
const ARTICLE_FEED_KINDS = [LONG_FORM_ARTICLE_KIND] as const;
```

- Implement `loadArticlesFeed` next to `loadFollowingFeed`:

```ts
async loadArticlesFeed(input: LoadArticlesFeedInput): Promise<SocialFeedPage> {
    const authors = [...new Set(input.authors.filter((pubkey) => typeof pubkey === 'string' && pubkey.length > 0))];
    if (authors.length === 0) {
        return { items: [], hasMore: false };
    }

    return withRelayFallback(async (transport) => {
        const limit = clampLimit(input.limit, DEFAULT_FEED_LIMIT);
        const queryLimit = resolveQueryLimit(limit);
        const authorChunks = chunkAuthors(authors);
        const batchEvents: NostrEvent[] = [];

        for (const authorChunk of authorChunks) {
            const filter: NostrFilter = {
                authors: authorChunk,
                kinds: [...ARTICLE_FEED_KINDS],
                limit: queryLimit,
            };
            if (typeof input.until === 'number') {
                filter.until = input.until;
            }

            const events = await fetchBackfillWithTimeout(transport, [filter], backfillTimeoutMs);
            batchEvents.push(...events);
        }

        const sortedItems = sortAndDedupe(batchEvents)
            .map(toArticleFeedItem)
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id));

        const pageItems = sortedItems.slice(0, limit);
        const hasMore = sortedItems.length > limit;
        const result: SocialFeedPage = { items: pageItems, hasMore };
        const nextUntil = hasMore ? nextUntilFromItems(pageItems) : undefined;
        if (typeof nextUntil === 'number') {
            result.nextUntil = nextUntil;
        }
        return result;
    });
}
```

- [ ] **Step 4: Run tests and confirm pass**

Run:

```bash
pnpm test:unit:frontend -- src/nostr/social-feed-runtime-service.test.ts
```

Expected: PASS.

---

## Chunk 3: Query Hooks And Controller

### Task 4: Add article feed query key and hook

**Files:**
- Modify: `src/nostr-overlay/query/keys.ts`
- Modify: `src/nostr-overlay/query/following-feed.query.ts`

- [ ] **Step 1: Add query key**

In `nostrOverlayQueryKeys`, add an `articlesFeed` key that includes:

- `ownerPubkey`
- normalized `follows`
- `pageSize`

- [ ] **Step 2: Add `useArticlesFeedInfiniteQuery`**

In `src/nostr-overlay/query/following-feed.query.ts`, add:

```ts
interface UseArticlesFeedInfiniteQueryOptions {
    ownerPubkey?: string;
    follows: string[];
    service: SocialFeedService;
    enabled: boolean;
    pageSize?: number;
}

export function useArticlesFeedInfiniteQuery(options: UseArticlesFeedInfiniteQueryOptions) {
    const follows = normalizeEventIds(options.follows);
    const pageSize = Math.max(1, options.pageSize ?? DEFAULT_FEED_PAGE_SIZE);

    return useInfiniteQuery<SocialFeedPage, Error>(createSocialQueryOptions({
        queryKey: nostrOverlayQueryKeys.articlesFeed({
            ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
            follows,
            pageSize,
        }),
        queryFn: ({ pageParam }: { pageParam: unknown }) => {
            const until = typeof pageParam === 'number' ? pageParam : undefined;
            return options.service.loadArticlesFeed({
                authors: follows,
                limit: pageSize,
                ...(until !== undefined ? { until } : {}),
            });
        },
        enabled: options.enabled && follows.length > 0,
        initialPageParam: undefined,
        getNextPageParam: (lastPage: SocialFeedPage) => (lastPage.hasMore ? lastPage.nextUntil : undefined),
    }));
}
```

- [ ] **Step 3: Run relevant query tests**

Run existing query tests if available:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/query
```

Expected: PASS.

---

### Task 5: Add articles controller

**Files:**
- Create: `src/nostr-overlay/controllers/use-overlay-articles-controller.ts`
- Create or modify: `src/nostr-overlay/controllers/use-overlay-articles-controller.test.tsx` if controller tests are practical.

- [ ] **Step 1: Implement hook**

Create a small hook:

```ts
import { useMemo } from 'react';
import type { SocialFeedService } from '../../nostr/social-feed-service';
import { useArticlesFeedInfiniteQuery } from '../query/following-feed.query';

interface UseOverlayArticlesControllerOptions {
    ownerPubkey?: string;
    follows: string[];
    isArticlesRoute: boolean;
    service: SocialFeedService;
    pageSize?: number;
}

export function useOverlayArticlesController(options: UseOverlayArticlesControllerOptions) {
    const canAccessArticles = Boolean(options.ownerPubkey);
    const query = useArticlesFeedInfiniteQuery({
        ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
        follows: options.follows,
        service: options.service,
        enabled: canAccessArticles && options.isArticlesRoute,
        pageSize: options.pageSize ?? 10,
    });

    const items = useMemo(
        () => query.data?.pages.flatMap((page) => page.items) ?? [],
        [query.data]
    );

    return {
        canAccessArticles,
        items,
        isLoading: query.isLoading,
        isRefreshing: query.isRefetching,
        error: query.error?.message ?? null,
        hasMore: Boolean(query.hasNextPage),
        loadMore: async () => { await query.fetchNextPage(); },
        refresh: async () => { await query.refetch(); },
    };
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck:frontend
```

Expected: PASS or only known unrelated failures.

---

## Chunk 4: Routing And Sidebar Navigation

### Task 6: Detect article routes

**Files:**
- Modify: `src/nostr-overlay/shell/use-overlay-route-state.ts`
- Modify: `src/nostr-overlay/shell/use-overlay-route-state.test.tsx`

- [ ] **Step 1: Add route-state tests**

Add tests for:

- `/agora/articles` sets `isArticlesRoute` true.
- `/agora/articles/<id>` sets `isArticleDetailRoute` true if detail route is included.
- `activeAgoraHashtag` is undefined outside `/agora`.

- [ ] **Step 2: Implement route-state flags**

Add:

```ts
const isArticlesRoute = location.pathname === '/agora/articles';
const isArticleDetailRoute = location.pathname.startsWith('/agora/articles/');
```

Return both values from the hook.

- [ ] **Step 3: Run route-state tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/shell/use-overlay-route-state.test.tsx
```

Expected: PASS.

---

### Task 7: Add sidebar item below Agora

**Files:**
- Modify: `src/nostr-overlay/components/OverlaySidebar.tsx`
- Modify: `src/nostr-overlay/components/OverlaySidebar.test.tsx`
- Modify: `src/nostr-overlay/shell/OverlaySidebarLayer.tsx`
- Modify: `src/nostr-overlay/shell/OverlaySidebarLayer.test.tsx`
- Modify: `src/nostr-overlay/App.tsx`
- Modify: `src/nostr-overlay/App.test.tsx`

- [ ] **Step 1: Add failing sidebar tests**

Update tests to expect order:

```text
Mapa / Agora / Articulos / Publicar / Chats / Relays / Notificaciones / Buscar / Estadisticas / Descubre / Wallet / Ajustes
```

Use exact existing text labels from i18n once added.

- [ ] **Step 2: Add props and callback wiring**

Add `onOpenArticles: () => void` to:

- `OverlaySidebarProps`
- `SidebarActionsMenu` props destructuring
- `OverlaySidebarLayerProps`
- `OverlaySidebarLayer` pass-through
- `App.tsx` sidebar layer usage

- [ ] **Step 3: Add open handler in `App.tsx`**

Add:

```ts
const openArticles = (): void => {
    if (!canAccessFollowingFeed) {
        return;
    }

    navigate('/agora/articles');
};
```

- [ ] **Step 4: Render Articulos item below Agora**

In `OverlaySidebar.tsx`, import an icon such as `NewspaperIcon` from `lucide-react`, then insert immediately after the Agora item:

```tsx
<SidebarMenuItem>
    <SidebarMenuButton asChild isActive={activePath === '/agora/articles' || activePath.startsWith('/agora/articles/')}>
        <button
            type="button"
            aria-label={t('sidebar.openArticles')}
            title={t('sidebar.articles')}
            onClick={onOpenArticles}
        >
            <NewspaperIcon />
            <span>{t('sidebar.articles')}</span>
        </button>
    </SidebarMenuButton>
</SidebarMenuItem>
```

- [ ] **Step 5: Run sidebar tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/OverlaySidebar.test.tsx src/nostr-overlay/shell/OverlaySidebarLayer.test.tsx
```

Expected: PASS.

---

### Task 8: Register article routes

**Files:**
- Modify: `src/nostr-overlay/routes/OverlayRoutes.tsx`
- Modify: `src/nostr-overlay/routes/OverlayRoutes.test.tsx`
- Create: `src/nostr-overlay/routes/ArticlesRouteContainer.tsx`
- Create: `src/nostr-overlay/routes/ArticleDetailRouteContainer.tsx`

- [ ] **Step 1: Add failing route tests**

Add tests that:

- `/agora/articles` renders articles route.
- `/agora/articles/<eventId>` renders article detail route.
- login gate redirects protected article routes like other app routes.

- [ ] **Step 2: Add route props**

Extend `OverlayRoutesProps`:

```ts
articles: ArticlesRouteContainerProps;
articleDetail: ArticleDetailRouteContainerProps;
```

- [ ] **Step 3: Add routes**

```tsx
<Route path="/agora/articles" element={<ArticlesRouteContainer {...articles} />} />
<Route path="/agora/articles/:eventId" element={<ArticleDetailRouteContainer {...articleDetail} />} />
```

- [ ] **Step 4: Create placeholder route containers**

Initially render minimal placeholders using translated strings. Replace with real surfaces in later tasks.

- [ ] **Step 5: Run route tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/routes/OverlayRoutes.test.tsx
```

Expected: PASS.

---

## Chunk 5: Short Note Rendering

### Task 9: Preserve newlines in `RichNostrContent`

**Files:**
- Modify: `src/nostr-overlay/components/RichNostrContent.tsx`
- Modify: `src/nostr-overlay/components/RichNostrContent.test.tsx`

- [ ] **Step 1: Add tests**

Add tests that render:

```tsx
<RichNostrContent content={'linea 1\nlinea 2'} />
```

Assertions:

- Text contains both lines.
- The text container has a class that preserves whitespace, e.g. `whitespace-pre-wrap` or existing CSS class updated accordingly.
- Markdown syntax in `kind:1` remains literal text: `# title` should not become an `h1`.

- [ ] **Step 2: Run tests and confirm failure if current CSS does not preserve whitespace**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/RichNostrContent.test.tsx
```

- [ ] **Step 3: Implement minimal change**

Change the default text class in `RichNostrContent`:

```tsx
<p className={textClassName || 'nostr-rich-content-text whitespace-pre-wrap break-words'}>
```

If `nostr-rich-content-text` is CSS-defined elsewhere, prefer updating that CSS once rather than duplicating Tailwind classes in multiple call sites.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/RichNostrContent.test.tsx
```

Expected: PASS.

---

## Chunk 6: Article Preview And Markdown Components

### Task 10: Add `ArticlePreviewCard`

**Files:**
- Create: `src/nostr-overlay/components/ArticlePreviewCard.tsx`
- Create: `src/nostr-overlay/components/ArticlePreviewCard.test.tsx`

- [ ] **Step 1: Write component tests**

Cover:

- Renders title, summary, image, and topics from tags.
- Uses fallback title when title tag is missing.
- Calls `onOpenArticle(event.id)` when read button/card action is selected.
- Image has alt text.

- [ ] **Step 2: Implement component**

Use shadcn composition:

- `Card`
- `CardHeader`
- `CardContent`
- `CardFooter`
- `Badge`
- `Button`

Do not use custom raw color classes. Use semantic tokens.

Suggested props:

```ts
interface ArticlePreviewCardProps {
    event: NostrEvent;
    authorLabel?: string;
    compact?: boolean;
    onOpenArticle?: (eventId: string) => void;
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/ArticlePreviewCard.test.tsx
```

Expected: PASS.

---

### Task 11: Add sanitized Markdown article content

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/nostr-overlay/components/ArticleMarkdownContent.tsx`
- Create: `src/nostr-overlay/components/ArticleMarkdownContent.test.tsx`

- [ ] **Step 1: Install dependencies**

Run:

```bash
pnpm add react-markdown rehype-sanitize
```

- [ ] **Step 2: Write tests**

Cover:

- `# Heading` renders a heading.
- `**bold**` renders strong text.
- Raw HTML like `<script>alert(1)</script>` is not executable and not inserted as a script node.
- Article image has alt text.

- [ ] **Step 3: Implement component**

Use:

```tsx
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
```

Render metadata outside Markdown, then:

```tsx
<Markdown rehypePlugins={[rehypeSanitize]}>
    {event.content}
</Markdown>
```

Do not add `rehypeRaw`. Do not use `dangerouslySetInnerHTML`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/ArticleMarkdownContent.test.tsx
```

Expected: PASS.

---

### Task 12: Dispatch articles in `NoteCard`

**Files:**
- Modify: `src/nostr-overlay/components/note-card-model.ts`
- Modify: `src/nostr-overlay/components/note-card-adapters.ts`
- Modify: `src/nostr-overlay/components/NoteCard.tsx`
- Modify: `src/nostr-overlay/components/NoteCard.test.tsx`

- [ ] **Step 1: Add failing tests**

Add tests that:

- `NoteCard` with `kindNumber: 30023` renders article preview title.
- `NoteCard` with `kindNumber: 1` still renders `RichNostrContent` behavior.

- [ ] **Step 2: Add model field**

In `NoteCardModel`:

```ts
kindNumber: number;
```

- [ ] **Step 3: Update adapters**

Set `kindNumber` from raw events:

- `fromPostPreview`: `post.rawEvent?.kind ?? 1`
- `fromFeedItem`: `item.eventKind ?? item.rawEvent?.kind ?? 1`
- `fromThreadItem`: `item.eventKind`
- `fromResolvedReferenceEvent`: `event.kind`
- `fromEmbeddedRepost`: add `kind` to `EmbeddedRepostInput`, fallback to `1` if absent.

- [ ] **Step 4: Render article preview**

In `NoteCard.tsx`:

```tsx
{note.kindNumber === LONG_FORM_ARTICLE_KIND ? (
    <ArticlePreviewCard event={{ id: note.id, pubkey: note.pubkey, kind: note.kindNumber, created_at: note.createdAt, tags: note.tags, content: note.content }} />
) : (
    <RichNostrContent ... />
)}
```

Prefer a small helper to build a `NostrEvent` from `NoteCardModel` if it keeps JSX readable.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/NoteCard.test.tsx
```

Expected: PASS.

---

## Chunk 7: Articles Section UI

### Task 13: Add `ArticlesSurface`

**Files:**
- Create: `src/nostr-overlay/components/ArticlesSurface.tsx`
- Create: `src/nostr-overlay/components/ArticlesSurface.test.tsx`

- [ ] **Step 1: Write tests**

Cover:

- Loading state renders spinner and loading copy.
- Empty state renders `Empty` copy.
- Items render `ArticlePreviewCard` titles.
- Load more button calls handler when `hasMore`.
- Refresh button calls handler.

- [ ] **Step 2: Implement surface**

Use `OverlaySurface`, `Empty`, `Button`, `Spinner`, and `ArticlePreviewCard`.

Props:

```ts
interface ArticlesSurfaceProps {
    items: SocialFeedItem[];
    profilesByPubkey: Record<string, NostrProfile>;
    isLoading: boolean;
    isRefreshing: boolean;
    error: string | null;
    hasMore: boolean;
    onRefresh: () => Promise<void> | void;
    onLoadMore: () => Promise<void> | void;
    onOpenArticle: (eventId: string) => void;
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/components/ArticlesSurface.test.tsx
```

Expected: PASS.

---

### Task 14: Wire `ArticlesRouteContainer`

**Files:**
- Modify: `src/nostr-overlay/routes/ArticlesRouteContainer.tsx`
- Modify: `src/nostr-overlay/App.tsx`

- [ ] **Step 1: Replace placeholder container**

Have `ArticlesRouteContainer` render `ArticlesSurface`.

- [ ] **Step 2: Wire controller in `App.tsx`**

Import and call `useOverlayArticlesController`:

```ts
const articles = useOverlayArticlesController({
    ...(overlay.ownerPubkey ? { ownerPubkey: overlay.ownerPubkey } : {}),
    follows: overlay.follows,
    isArticlesRoute: isArticlesRoute || isArticleDetailRoute,
    service: overlay.socialFeedService,
});
```

- [ ] **Step 3: Pass route props**

Pass to `OverlayRoutes`:

```tsx
articles={{
    items: articles.items,
    profilesByPubkey: richContentProfilesByPubkey,
    isLoading: articles.isLoading,
    isRefreshing: articles.isRefreshing,
    error: articles.error,
    hasMore: articles.hasMore,
    onRefresh: articles.refresh,
    onLoadMore: articles.loadMore,
    onOpenArticle: (eventId) => navigate(`/agora/articles/${eventId}`),
}}
```

- [ ] **Step 4: Run App route tests**

Run focused tests:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/App.test.tsx src/nostr-overlay/routes/OverlayRoutes.test.tsx
```

Expected: PASS.

---

## Chunk 8: Full Article Detail

### Task 15: Add article detail query and route

**Files:**
- Modify: `src/nostr-overlay/query/keys.ts`
- Modify: `src/nostr-overlay/query/following-feed.query.ts`
- Modify: `src/nostr-overlay/routes/ArticleDetailRouteContainer.tsx`
- Add/modify tests for detail route.

- [ ] **Step 1: Add detail query**

Add `useArticleDetailQuery` that fetches by `ids: [eventId]`, `kinds: [30023]`.

If `SocialFeedService` does not expose generic event fetching, either:

- Add `loadArticleById(eventId)` to the service contract, or
- Reuse existing event reference resolver if it can query by ID and then validate `kind === 30023`.

Prefer the service method if it keeps responsibilities explicit.

- [ ] **Step 2: Implement `ArticleDetailRouteContainer`**

Render:

- loading state
- missing/error state
- back button to `/agora/articles`
- `ArticleMarkdownContent` for resolved event

- [ ] **Step 3: Run tests**

Run:

```bash
pnpm test:unit:frontend -- src/nostr-overlay/routes/OverlayRoutes.test.tsx
```

Expected: PASS.

---

## Chunk 9: i18n

### Task 16: Add translations

**Files:**
- Modify: `src/i18n/messages/es.ts`
- Modify: `src/i18n/messages/en.ts`

- [ ] **Step 1: Add Spanish keys**

Suggested Spanish values:

```ts
'sidebar.articles': 'Articulos',
'sidebar.openArticles': 'Abrir articulos',
'articles.title': 'Articulos',
'articles.subtitle': 'Lecturas largas de las personas que sigues',
'articles.loadingTitle': 'Cargando articulos',
'articles.loadingDescription': 'Buscando notas largas en tus relays.',
'articles.emptyTitle': 'Sin articulos',
'articles.emptyDescription': 'Todavia no hay articulos de las personas que sigues.',
'articles.refresh': 'Actualizar',
'articles.refreshing': 'Actualizando',
'articles.loadMore': 'Cargar mas',
'articles.readArticle': 'Leer articulo',
'articles.untitled': 'Articulo sin titulo',
'articles.imageAlt': 'Imagen del articulo {{title}}',
'articles.back': 'Volver a articulos',
'articles.published': 'Publicado {{date}}',
'articles.markdownUnavailable': 'No se pudo mostrar el articulo.',
```

- [ ] **Step 2: Add English keys**

Equivalent English values:

```ts
'sidebar.articles': 'Articles',
'sidebar.openArticles': 'Open articles',
'articles.title': 'Articles',
'articles.subtitle': 'Long-form reads from people you follow',
'articles.loadingTitle': 'Loading articles',
'articles.loadingDescription': 'Looking for long-form notes on your relays.',
'articles.emptyTitle': 'No articles yet',
'articles.emptyDescription': 'There are no articles from people you follow yet.',
'articles.refresh': 'Refresh',
'articles.refreshing': 'Refreshing',
'articles.loadMore': 'Load more',
'articles.readArticle': 'Read article',
'articles.untitled': 'Untitled article',
'articles.imageAlt': 'Article image for {{title}}',
'articles.back': 'Back to articles',
'articles.published': 'Published {{date}}',
'articles.markdownUnavailable': 'The article could not be displayed.',
```

- [ ] **Step 3: Typecheck i18n**

Run:

```bash
pnpm typecheck:frontend
```

Expected: PASS.

---

## Chunk 10: Verification

### Task 17: Focused verification

Run:

```bash
pnpm test:unit:frontend -- src/nostr/articles.test.ts
pnpm test:unit:frontend -- src/nostr/social-feed-service.test.ts
pnpm test:unit:frontend -- src/nostr/social-feed-runtime-service.test.ts
pnpm test:unit:frontend -- src/nostr-overlay/components/RichNostrContent.test.tsx
pnpm test:unit:frontend -- src/nostr-overlay/components/ArticlePreviewCard.test.tsx
pnpm test:unit:frontend -- src/nostr-overlay/components/ArticleMarkdownContent.test.tsx
pnpm test:unit:frontend -- src/nostr-overlay/components/ArticlesSurface.test.tsx
pnpm test:unit:frontend -- src/nostr-overlay/components/NoteCard.test.tsx
pnpm test:unit:frontend -- src/nostr-overlay/components/OverlaySidebar.test.tsx
pnpm test:unit:frontend -- src/nostr-overlay/routes/OverlayRoutes.test.tsx
```

Expected: all focused tests pass.

### Task 18: Project verification

Run:

```bash
pnpm lint:frontend
pnpm typecheck:frontend
pnpm test:unit:frontend
```

Expected: all checks pass.

### Task 19: Manual QA checklist

- [ ] Sidebar still has **Agora** opening `/agora`.
- [ ] Sidebar has **Articulos** immediately below Agora opening `/agora/articles`.
- [ ] `/agora` still shows current timeline behavior.
- [ ] `/agora/articles` lists `kind:30023` article previews from followed authors.
- [ ] Empty articles state appears when followed authors have no articles.
- [ ] Short notes preserve line breaks.
- [ ] Short notes do not render Markdown headings/lists as HTML.
- [ ] Article previews show title, summary/excerpt, image, topics, and date where available.
- [ ] Article detail renders Markdown headings, emphasis, lists, links, and code.
- [ ] Raw HTML/script in article content is not executed.
- [ ] Keyboard users can tab to Agora and Articulos and activate both.
- [ ] Mobile sidebar/panel layout remains usable.

---

## Risk Register

| Risk | Mitigation |
| --- | --- |
| Article Markdown increases initial bundle | Lazy-load `ArticleMarkdownContent` in detail route if bundle impact is noticeable. |
| Raw HTML or script injection from article content | Use `react-markdown` without `rehypeRaw`, with `rehype-sanitize`; never use `dangerouslySetInnerHTML`. |
| Article feed overloads relays | Query only followed authors in first implementation. |
| Sidebar UX changes too much | Keep Agora as existing sibling item; add Articulos below it, no new collapsible group. |
| Existing note cards assume `kind:1` | Add `kindNumber` with safe fallback in all adapters. |
| i18n gaps | Add ES and EN keys before using visible strings. |

---

## Suggested Commit Sequence

1. `feat: add nostr article metadata helpers`
2. `feat: query long-form article feed`
3. `feat: add articles sidebar route`
4. `feat: render article previews`
5. `feat: render sanitized article markdown`
6. `test: cover articles navigation and formatting`

Plan complete and saved for later implementation.

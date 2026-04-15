import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { FollowingFeedSurface } from './FollowingFeedSurface';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

function buildProps(overrides: Partial<Parameters<typeof FollowingFeedSurface>[0]> = {}): Parameters<typeof FollowingFeedSurface>[0] {
    return {
        items: [],
        hasFollows: true,
        profilesByPubkey: {},
        engagementByEventId: {},
        activeHashtag: undefined,
        isLoadingFeed: false,
        feedError: null,
        hasMoreFeed: false,
        activeThread: null,
        canWrite: true,
        isPublishingPost: false,
        isPublishingReply: false,
        publishError: null,
        reactionByEventId: {},
        repostByEventId: {},
        pendingReactionByEventId: {},
        pendingRepostByEventId: {},
        onLoadMoreFeed: async () => {},
        onOpenThread: async () => {},
        onCloseThread: () => {},
        onLoadMoreThread: async () => {},
        onPublishPost: async () => true,
        onPublishReply: async () => true,
        onToggleReaction: async () => true,
        onToggleRepost: async () => true,
        onSelectHashtag: () => {},
        onSelectProfile: () => {},
        onResolveProfiles: async () => {},
        onSelectEventReference: () => {},
        onResolveEventReferences: async () => {},
        eventReferencesById: {},
        onCopyNoteId: () => {},
        onClearHashtag: () => {},
        ...overrides,
    };
}

describe('FollowingFeedSurface', () => {
    test('load more feed action requests next query page', async () => {
        const onLoadMoreFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    hasMoreFeed: true,
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'hola feed',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'hola feed',
                            },
                        },
                    ],
                    onLoadMoreFeed,
                })}
            />
        );
        mounted.push(rendered);

        const loadMoreButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Cargar mas')
        ) as HTMLButtonElement;
        expect(loadMoreButton).toBeDefined();

        await act(async () => {
            loadMoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onLoadMoreFeed).toHaveBeenCalledTimes(1);
    });

    test('load more thread action requests next query page', async () => {
        const onLoadMoreThread = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: true,
                    },
                    onLoadMoreThread,
                })}
            />
        );
        mounted.push(rendered);

        const loadMoreRepliesButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Cargar mas respuestas')
        ) as HTMLButtonElement;
        expect(loadMoreRepliesButton).toBeDefined();

        await act(async () => {
            loadMoreRepliesButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onLoadMoreThread).toHaveBeenCalledTimes(1);
    });

    test('renders empty state without legacy close action', async () => {
        const rendered = await renderElement(<FollowingFeedSurface {...buildProps()} />);
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Sin publicaciones');
        expect(rendered.container.textContent || '').not.toContain('Volver al mapa');
        expect(rendered.container.textContent || '').toContain('Timeline en tiempo real de personas que sigues');

        const surfaceContent = rendered.container.querySelector('.nostr-following-feed-surface-content') as HTMLElement;
        expect(surfaceContent).toBeDefined();
        expect(surfaceContent.classList.contains('nostr-following-feed-dialog')).toBe(false);
    });

    test('renders no-follows empty state using Empty component copy', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    hasFollows: false,
                    items: [],
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('No sigues a nadie todavia');
        expect(text).toContain('Empieza a seguir perfiles para ver su actividad en Agora.');
    });

    test('renders author identity and engagement icon counters on cards', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    profilesByPubkey: {
                        ['a'.repeat(64)]: {
                            pubkey: 'a'.repeat(64),
                            displayName: 'Alice Surface',
                        },
                    },
                    engagementByEventId: {
                        'note-1': {
                            replies: 1,
                            reposts: 2,
                            reactions: 3,
                            zaps: 4,
                            zapSats: 210,
                        },
                    },
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'hola surface',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'hola surface',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Alice Surface');
        expect(rendered.container.querySelector('button[aria-label="Responder (1)"]')).toBeDefined();
        expect(rendered.container.querySelector('button[aria-label="Reaccionar (3)"]')).toBeDefined();
        expect(rendered.container.querySelector('button[aria-label="Repostear (2)"]')).toBeDefined();
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 210"]')).toBeDefined();
    });

    test('renders optimistic pending states for reaction and repost actions', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    engagementByEventId: {
                        'note-1': {
                            replies: 0,
                            reposts: 5,
                            reactions: 7,
                            zaps: 0,
                            zapSats: 0,
                        },
                    },
                    pendingReactionByEventId: { 'note-1': true },
                    pendingRepostByEventId: { 'note-1': true },
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'optimistic note',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'optimistic note',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const reactionButton = rendered.container.querySelector('button[aria-label="Reaccionar (7)"]') as HTMLButtonElement;
        const repostButton = rendered.container.querySelector('button[aria-label="Repostear (5)"]') as HTMLButtonElement;
        expect(reactionButton).toBeDefined();
        expect(repostButton).toBeDefined();
        expect(reactionButton.disabled).toBe(true);
        expect(repostButton.disabled).toBe(true);
    });

    test('keeps thread actions working inside routed surface', async () => {
        const onPublishReply = vi.fn(async () => true);
        const onToggleReaction = vi.fn(async () => true);
        const onToggleRepost = vi.fn(async () => true);
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply uno',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1']],
                                    content: 'reply uno',
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                    engagementByEventId: {
                        'root-1': {
                            replies: 4,
                            reposts: 2,
                            reactions: 3,
                            zaps: 1,
                            zapSats: 210,
                        },
                        'reply-1': {
                            replies: 1,
                            reposts: 0,
                            reactions: 7,
                            zaps: 0,
                            zapSats: 21,
                        },
                    },
                    onPublishReply,
                    onToggleReaction,
                    onToggleRepost,
                })}
            />
        );
        mounted.push(rendered);

        const textarea = rendered.container.querySelector('.nostr-following-feed-reply-box textarea') as HTMLTextAreaElement;
        expect(textarea).toBeDefined();

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            valueSetter?.call(textarea, 'respuesta surface');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const sendButton = Array.from(rendered.container.querySelectorAll('.nostr-following-feed-reply-box button')).find((button) =>
            (button.textContent || '').includes('Responder')
        ) as HTMLButtonElement;
        expect(sendButton).toBeDefined();

        await act(async () => {
            sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onPublishReply).toHaveBeenCalledWith({
            targetEventId: 'root-1',
            targetPubkey: 'b'.repeat(64),
            rootEventId: 'root-1',
            content: 'respuesta surface',
        });

        const replyReactionButton = rendered.container.querySelector('button[aria-label="Reaccionar (7)"]') as HTMLButtonElement;
        const replyRepostButton = rendered.container.querySelector('button[aria-label="Repostear (0)"]') as HTMLButtonElement;
        expect(replyReactionButton).toBeDefined();
        expect(replyRepostButton).toBeDefined();

        await act(async () => {
            replyReactionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            replyRepostButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onToggleReaction).toHaveBeenCalledWith({
            eventId: 'reply-1',
            targetPubkey: 'c'.repeat(64),
        });
        expect(onToggleRepost).toHaveBeenCalledWith({
            eventId: 'reply-1',
            targetPubkey: 'c'.repeat(64),
            repostContent: 'reply uno',
        });
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 210"]')).toBeDefined();
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 21"]')).toBeDefined();
    });

    test('removes redundant labels, shows time at card top, and supports copy action', async () => {
        const onCopyNoteId = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onCopyNoteId,
                    items: [
                        {
                            id: 'repost-no-comment',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: JSON.stringify({
                                id: 'embedded-note',
                                pubkey: 'b'.repeat(64),
                                created_at: 90,
                                kind: 1,
                                content: 'nota citada',
                                tags: [],
                            }),
                            kind: 'repost',
                            rawEvent: {
                                id: 'repost-no-comment',
                                pubkey: 'a'.repeat(64),
                                kind: 6,
                                created_at: 100,
                                tags: [['e', 'embedded-note']],
                                content: '',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).not.toContain('Repost sin comentario');
        expect(text).not.toContain('Nota original');
        expect(text).not.toContain('Nota');
        expect(text).toContain('nota citada');

        expect(rendered.container.querySelector('time[datetime]')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-following-feed-card-time')).toBeNull();

        const copyButton = rendered.container.querySelector('button[aria-label="Copiar identificador de nota repost-no-comment"]') as HTMLButtonElement;
        expect(copyButton).toBeDefined();

        await act(async () => {
            copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNoteId).toHaveBeenCalledWith('repost-no-comment');
    });

    test('keeps raw repost text when embedded repost parsing fails', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    items: [
                        {
                            id: 'repost-invalid-json',
                            pubkey: 'a'.repeat(64),
                            createdAt: 120,
                            content: '{"id":"broken",',
                            kind: 'repost',
                            rawEvent: {
                                id: 'repost-invalid-json',
                                pubkey: 'a'.repeat(64),
                                kind: 6,
                                created_at: 120,
                                tags: [['e', 'broken']],
                                content: '{"id":"broken",',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('{"id":"broken",');
    });

    test('keeps feed, root and reply action buttons disabled when pending and when canWrite is false', async () => {
        const renderedFeed = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    canWrite: false,
                    pendingReactionByEventId: {
                        'feed-1': false,
                    },
                    pendingRepostByEventId: {
                        'feed-1': false,
                    },
                    engagementByEventId: {
                        'feed-1': {
                            replies: 1,
                            reposts: 2,
                            reactions: 3,
                            zaps: 0,
                            zapSats: 210,
                        },
                    },
                    items: [
                        {
                            id: 'feed-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'feed note',
                            kind: 'note',
                            rawEvent: {
                                id: 'feed-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'feed note',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(renderedFeed);

        const feedReactionButton = renderedFeed.container.querySelector('button[aria-label="Reaccionar (3)"]') as HTMLButtonElement;
        const feedRepostButton = renderedFeed.container.querySelector('button[aria-label="Repostear (2)"]') as HTMLButtonElement;
        expect(feedReactionButton.disabled).toBe(true);
        expect(feedRepostButton.disabled).toBe(true);

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    canWrite: false,
                    pendingReactionByEventId: {
                        'root-1': true,
                        'reply-1': true,
                    },
                    pendingRepostByEventId: {
                        'root-1': true,
                        'reply-1': true,
                    },
                    engagementByEventId: {
                        'root-1': {
                            replies: 1,
                            reposts: 5,
                            reactions: 7,
                            zaps: 0,
                            zapSats: 99,
                        },
                        'reply-1': {
                            replies: 0,
                            reposts: 6,
                            reactions: 8,
                            zaps: 0,
                            zapSats: 33,
                        },
                    },
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply one',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1']],
                                    content: 'reply one',
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const threadRootReaction = rendered.container.querySelector('button[aria-label="Reaccionar (7)"]') as HTMLButtonElement;
        const threadRootRepost = rendered.container.querySelector('button[aria-label="Repostear (5)"]') as HTMLButtonElement;
        const threadReplyReaction = rendered.container.querySelector('button[aria-label="Reaccionar (8)"]') as HTMLButtonElement;
        const threadReplyRepost = rendered.container.querySelector('button[aria-label="Repostear (6)"]') as HTMLButtonElement;

        expect(threadRootReaction.disabled).toBe(true);
        expect(threadRootRepost.disabled).toBe(true);
        expect(threadReplyReaction.disabled).toBe(true);
        expect(threadReplyRepost.disabled).toBe(true);
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 99"]')).toBeDefined();
        expect(rendered.container.querySelector('[aria-label="Sats recibidos: 33"]')).toBeDefined();
    });

    test('keeps copy note id callback for feed and thread notes', async () => {
        const onCopyNoteId = vi.fn();
        const renderedFeed = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onCopyNoteId,
                    items: [
                        {
                            id: 'feed-copy-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'feed copy',
                            kind: 'note',
                            rawEvent: {
                                id: 'feed-copy-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'feed copy',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(renderedFeed);

        const feedCopyButton = renderedFeed.container.querySelector('button[aria-label="Copiar identificador de nota feed-copy-1"]') as HTMLButtonElement;
        expect(feedCopyButton).toBeDefined();
        await act(async () => {
            feedCopyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onCopyNoteId,
                    items: [
                        {
                            id: 'feed-copy-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'feed copy',
                            kind: 'note',
                            rawEvent: {
                                id: 'feed-copy-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'feed copy',
                            },
                        },
                    ],
                    activeThread: {
                        rootEventId: 'root-1',
                        root: {
                            id: 'root-1',
                            pubkey: 'b'.repeat(64),
                            createdAt: 500,
                            eventKind: 1,
                            content: 'root',
                            rawEvent: {
                                id: 'root-1',
                                pubkey: 'b'.repeat(64),
                                kind: 1,
                                created_at: 500,
                                tags: [],
                                content: 'root',
                            },
                        },
                        replies: [
                            {
                                id: 'reply-1',
                                pubkey: 'c'.repeat(64),
                                createdAt: 510,
                                eventKind: 1,
                                content: 'reply one',
                                targetEventId: 'root-1',
                                rawEvent: {
                                    id: 'reply-1',
                                    pubkey: 'c'.repeat(64),
                                    kind: 1,
                                    created_at: 510,
                                    tags: [['e', 'root-1']],
                                    content: 'reply one',
                                },
                            },
                        ],
                        isLoading: false,
                        isLoadingMore: false,
                        error: null,
                        hasMore: false,
                    },
                })}
            />
        );
        mounted.push(rendered);

        const rootCopyButton = rendered.container.querySelector('button[aria-label="Copiar identificador de nota root-1"]') as HTMLButtonElement;
        const replyCopyButton = rendered.container.querySelector('button[aria-label="Copiar identificador de nota reply-1"]') as HTMLButtonElement;
        expect(rootCopyButton).toBeDefined();
        expect(replyCopyButton).toBeDefined();

        await act(async () => {
            rootCopyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            replyCopyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNoteId).toHaveBeenCalledWith('root-1');
        expect(onCopyNoteId).toHaveBeenCalledWith('reply-1');
    });

    test('renders image/video URLs and makes hashtags clickable', async () => {
        const onSelectHashtag = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onSelectHashtag,
                    items: [
                        {
                            id: 'note-media-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'Mira #NostrCity https://example.com/photo.jpg https://example.com/clip.mp4',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-media-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'Mira #NostrCity https://example.com/photo.jpg https://example.com/clip.mp4',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.querySelector('img[src="https://example.com/photo.jpg"]')).toBeDefined();
        expect(rendered.container.querySelector('video')).toBeDefined();

        const hashtagButton = rendered.container.querySelector('button[aria-label="Filtrar por hashtag nostrcity"]') as HTMLButtonElement;
        expect(hashtagButton).toBeDefined();

        await act(async () => {
            hashtagButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectHashtag).toHaveBeenCalledWith('nostrcity');
    });

    test('renders nostr profile mentions with resolved names and opens profile on click', async () => {
        const mentionPubkey = 'c'.repeat(64);
        const mentionNprofile = nip19.nprofileEncode({ pubkey: mentionPubkey });
        const onSelectProfile = vi.fn();

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onSelectProfile,
                    profilesByPubkey: {
                        [mentionPubkey]: {
                            pubkey: mentionPubkey,
                            displayName: 'Carlos Mention',
                        },
                    },
                    items: [
                        {
                            id: 'note-mention-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: `hola nostr:${mentionNprofile}`,
                            kind: 'note',
                            rawEvent: {
                                id: 'note-mention-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: `hola nostr:${mentionNprofile}`,
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const mentionButton = rendered.container.querySelector('button[aria-label="Abrir perfil de Carlos Mention"]') as HTMLButtonElement;
        expect(mentionButton).toBeDefined();
        expect(mentionButton.textContent || '').toContain('@Carlos Mention');

        await act(async () => {
            mentionButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectProfile).toHaveBeenCalledWith(mentionPubkey);
    });

    test('requests profile resolution for unresolved mention pubkeys', async () => {
        const mentionPubkey = 'd'.repeat(64);
        const mentionNprofile = nip19.nprofileEncode({ pubkey: mentionPubkey });
        const onResolveProfiles = vi.fn(async () => {});

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onResolveProfiles,
                    items: [
                        {
                            id: 'note-mention-resolve',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: `mencion nostr:${mentionNprofile}`,
                            kind: 'note',
                            rawEvent: {
                                id: 'note-mention-resolve',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: `mencion nostr:${mentionNprofile}`,
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(onResolveProfiles).toHaveBeenCalledWith([mentionPubkey]);
    });

    test('renders nevent references as embedded quoted note cards and opens thread callback on click', async () => {
        const referencedEventId = 'e'.repeat(64);
        const referencedAuthorPubkey = 'f'.repeat(64);
        const nevent = nip19.neventEncode({ id: referencedEventId, author: referencedAuthorPubkey });
        const onSelectEventReference = vi.fn();

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onSelectEventReference,
                    profilesByPubkey: {
                        [referencedAuthorPubkey]: {
                            pubkey: referencedAuthorPubkey,
                            displayName: 'Nora Referenced',
                        },
                    },
                    eventReferencesById: {
                        [referencedEventId]: {
                            id: referencedEventId,
                            pubkey: referencedAuthorPubkey,
                            kind: 1,
                            created_at: 1700000000,
                            tags: [],
                            content: 'contenido de la nota citada',
                        },
                    },
                    items: [
                        {
                            id: 'note-ref-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: `mira esto nostr:${nevent}`,
                            kind: 'note',
                            rawEvent: {
                                id: 'note-ref-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: `mira esto nostr:${nevent}`,
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').not.toContain('Nota referenciada');
        expect(rendered.container.textContent || '').toContain('@Nora Referenced');
        expect(rendered.container.textContent || '').toContain('contenido de la nota citada');

        const openReferenceButton = rendered.container.querySelector(`button[aria-label="Abrir nota referenciada ${referencedEventId}"]`) as HTMLButtonElement;
        expect(openReferenceButton).toBeDefined();

        await act(async () => {
            openReferenceButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectEventReference).toHaveBeenCalledWith(referencedEventId);
    });

    test('requests unresolved nevent references for lazy loading', async () => {
        const referencedEventId = '1'.repeat(64);
        const nevent = nip19.neventEncode({ id: referencedEventId });
        const onResolveEventReferences = vi.fn(async () => {});

        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    onResolveEventReferences,
                    items: [
                        {
                            id: 'note-ref-resolve',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: `referencia nostr:${nevent}`,
                            kind: 'note',
                            rawEvent: {
                                id: 'note-ref-resolve',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: `referencia nostr:${nevent}`,
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Cargando nota referenciada...');
        expect(text).not.toContain('Pendiente de carga');
        expect(rendered.container.querySelector('svg[aria-label="Loading"]')).toBeDefined();

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(onResolveEventReferences).toHaveBeenCalledWith([referencedEventId], undefined);
    });

    test('retries unresolved nevent references when initial resolve returns empty', async () => {
        vi.useFakeTimers();
        try {
            const referencedEventId = '2'.repeat(64);
            const nevent = nip19.neventEncode({ id: referencedEventId });
            const onResolveEventReferences = vi.fn(async () => ({}));

            const rendered = await renderElement(
                <FollowingFeedSurface
                    {...buildProps({
                        onResolveEventReferences,
                        items: [
                            {
                                id: 'note-ref-retry',
                                pubkey: 'a'.repeat(64),
                                createdAt: 100,
                                content: `retry nostr:${nevent}`,
                                kind: 'note',
                                rawEvent: {
                                    id: 'note-ref-retry',
                                    pubkey: 'a'.repeat(64),
                                    kind: 1,
                                    created_at: 100,
                                    tags: [],
                                    content: `retry nostr:${nevent}`,
                                },
                            },
                        ],
                    })}
                />
            );
            mounted.push(rendered);

            await act(async () => {
                await Promise.resolve();
            });
            expect(onResolveEventReferences).toHaveBeenCalledTimes(1);

            await act(async () => {
                vi.advanceTimersByTime(1_600);
                await Promise.resolve();
            });

            expect(onResolveEventReferences).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    test('opens per-post media lightbox when clicking an image', async () => {
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    items: [
                        {
                            id: 'note-lightbox-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'https://example.com/photo-1.jpg https://example.com/photo-2.jpg',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-lightbox-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'https://example.com/photo-1.jpg https://example.com/photo-2.jpg',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const image = rendered.container.querySelector('img[src="https://example.com/photo-1.jpg"]') as HTMLImageElement;
        expect(image).toBeDefined();

        await act(async () => {
            image.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const lightboxRoot = document.body.querySelector('.yarl__root');
        expect(lightboxRoot).toBeDefined();
    });

    test('renders active hashtag subtitle and clear action', async () => {
        const onClearHashtag = vi.fn();
        const rendered = await renderElement(
            <FollowingFeedSurface
                {...buildProps({
                    activeHashtag: 'nostrcity',
                    onClearHashtag,
                })}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Filtrando por #nostrcity');
        const clearButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').trim() === 'Quitar filtro'
        ) as HTMLButtonElement;
        expect(clearButton).toBeDefined();

        await act(async () => {
            clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onClearHashtag).toHaveBeenCalledTimes(1);
    });
});

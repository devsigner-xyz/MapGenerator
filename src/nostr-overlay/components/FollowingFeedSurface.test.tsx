import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
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
        onClose: () => {},
        items: [],
        profilesByPubkey: {},
        engagementByEventId: {},
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
        ...overrides,
    };
}

describe('FollowingFeedSurface', () => {
    test('renders empty state and close action', async () => {
        const rendered = await renderElement(<FollowingFeedSurface {...buildProps()} />);
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Sin publicaciones');
        expect(rendered.container.textContent || '').toContain('Volver al mapa');
        expect(rendered.container.textContent || '').toContain('Timeline en tiempo real de personas que sigues');

        const surfaceContent = rendered.container.querySelector('.nostr-following-feed-surface-content') as HTMLElement;
        expect(surfaceContent).toBeDefined();
        expect(surfaceContent.classList.contains('nostr-following-feed-dialog')).toBe(false);
    });

    test('invokes onClose when clicking close action', async () => {
        const onClose = vi.fn();
        const rendered = await renderElement(<FollowingFeedSurface {...buildProps({ onClose })} />);
        mounted.push(rendered);

        const closeButton = Array.from(rendered.container.querySelectorAll('button')).find((button) =>
            (button.textContent || '').includes('Volver al mapa')
        ) as HTMLButtonElement;
        expect(closeButton).toBeDefined();

        await act(async () => {
            closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onClose).toHaveBeenCalledTimes(1);
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
        expect(rendered.container.querySelector('[aria-label="Zaps recibidos: 4"]')).toBeDefined();
    });

    test('keeps thread actions working inside routed surface', async () => {
        const onPublishReply = vi.fn(async () => true);
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
                        hasMore: false,
                    },
                    onPublishReply,
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
    });
});

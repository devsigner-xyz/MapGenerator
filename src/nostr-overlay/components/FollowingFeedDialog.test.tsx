import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { FollowingFeedDialog } from './FollowingFeedDialog';

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
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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

function buildProps(overrides: Partial<Parameters<typeof FollowingFeedDialog>[0]> = {}): Parameters<typeof FollowingFeedDialog>[0] {
    return {
        open: true,
        onClose: () => {},
        items: [],
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

describe('FollowingFeedDialog', () => {
    test('renders empty state when no items are available', async () => {
        const rendered = await renderElement(<FollowingFeedDialog {...buildProps()} />);
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Sin publicaciones');
    });

    test('loads more feed items on near-bottom scroll', async () => {
        const onLoadMoreFeed = vi.fn(async () => {});
        const rendered = await renderElement(
            <FollowingFeedDialog
                {...buildProps({
                    hasMoreFeed: true,
                    onLoadMoreFeed,
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'hola',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'hola',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const list = rendered.container.querySelector('.nostr-following-feed-list') as HTMLDivElement;
        expect(list).toBeDefined();

        Object.defineProperty(list, 'scrollHeight', { value: 400, configurable: true });
        Object.defineProperty(list, 'clientHeight', { value: 120, configurable: true });
        Object.defineProperty(list, 'scrollTop', { value: 300, configurable: true });

        await act(async () => {
            list.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        expect(onLoadMoreFeed).toHaveBeenCalledTimes(1);
    });

    test('triggers feed card actions', async () => {
        const onOpenThread = vi.fn(async () => {});
        const onToggleReaction = vi.fn(async () => true);
        const onToggleRepost = vi.fn(async () => true);

        const rendered = await renderElement(
            <FollowingFeedDialog
                {...buildProps({
                    onOpenThread,
                    onToggleReaction,
                    onToggleRepost,
                    items: [
                        {
                            id: 'note-1',
                            pubkey: 'a'.repeat(64),
                            createdAt: 100,
                            content: 'hola',
                            kind: 'note',
                            rawEvent: {
                                id: 'note-1',
                                pubkey: 'a'.repeat(64),
                                kind: 1,
                                created_at: 100,
                                tags: [],
                                content: 'hola',
                            },
                        },
                    ],
                })}
            />
        );
        mounted.push(rendered);

        const buttons = Array.from(rendered.container.querySelectorAll('.nostr-following-feed-card-actions button')) as HTMLButtonElement[];
        expect(buttons.length).toBeGreaterThanOrEqual(4);

        await act(async () => {
            buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
            buttons[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
            buttons[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onOpenThread).toHaveBeenCalledWith('note-1');
        expect(onToggleReaction).toHaveBeenCalledWith({ eventId: 'note-1', targetPubkey: 'a'.repeat(64) });
        expect(onToggleRepost).toHaveBeenCalledWith({
            eventId: 'note-1',
            targetPubkey: 'a'.repeat(64),
            repostContent: 'hola',
        });
    });

    test('publishes reply from thread composer', async () => {
        const onPublishReply = vi.fn(async () => true);
        const rendered = await renderElement(
            <FollowingFeedDialog
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
            valueSetter?.call(textarea, 'respuesta');
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
            content: 'respuesta',
        });
    });
});

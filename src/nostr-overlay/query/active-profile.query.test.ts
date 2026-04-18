/** @vitest-environment jsdom */

import { act, createElement, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createNostrOverlayQueryClient } from './query-client';
import {
    useActiveProfileQuery,
    type ActiveProfileNetworkResult,
    type ActiveProfilePostsPage,
    type ActiveProfileQueryService,
    type ActiveProfileStatsResult,
} from './active-profile.query';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
    rerender: (element: ReactElement) => Promise<void>;
}

interface ProbeProps {
    pubkey?: string;
    service: ActiveProfileQueryService;
    pageSize?: number;
    onUpdate: (next: ActiveProfileProbeState) => void;
}

interface ActiveProfileProbeState {
    posts: Array<{ id: string }>;
    hasMorePosts: boolean;
    loadMorePosts: () => Promise<void>;
    statsError?: string;
    networkLoading: boolean;
    followsCount: number;
    followersCount: number;
}

function ActiveProfileProbe({ pubkey, service, pageSize, onUpdate }: ProbeProps): null {
    const queryInput = {
        service,
        ...(pubkey === undefined ? {} : { pubkey }),
        ...(pageSize === undefined ? {} : { pageSize }),
    };
    const state = useActiveProfileQuery(queryInput);

    useEffect(() => {
        onUpdate(state as ActiveProfileProbeState);
    }, [onUpdate, state]);

    return null;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    async function render(nextElement: ReactElement): Promise<void> {
        await act(async () => {
            root.render(createElement(QueryClientProvider, { client: queryClient }, nextElement));
        });
    }

    await render(element);

    return {
        container,
        root,
        rerender: render,
    };
}

async function waitFor(condition: () => boolean): Promise<void> {
    for (let index = 0; index < 50; index += 1) {
        if (condition()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    throw new Error('Condition was not met in time');
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

function page(posts: string[], hasMore = false, nextUntil?: number): ActiveProfilePostsPage {
    const result: ActiveProfilePostsPage = {
        posts: posts.map((id, index) => ({
            id,
            pubkey: 'a'.repeat(64),
            createdAt: 10_000 - index,
            content: id,
        })),
        hasMore,
    };

    if (nextUntil !== undefined) {
        result.nextUntil = nextUntil;
    }

    return result;
}

function network(follows: string[] = [], followers: string[] = []): ActiveProfileNetworkResult {
    return {
        follows,
        followers,
        profiles: {},
    };
}

describe('useActiveProfileQuery', () => {
    test('keeps cache hit semantics when reopening the same pubkey', async () => {
        const loadPosts = vi.fn(async ({ pubkey }: { pubkey: string; limit?: number; until?: number }) => page([`${pubkey}-post`]));
        const loadStats = vi.fn(async (): Promise<ActiveProfileStatsResult> => ({ followsCount: 1, followersCount: 1 }));
        const loadNetwork = vi.fn(async (): Promise<ActiveProfileNetworkResult> => network());
        const service: ActiveProfileQueryService = { loadPosts, loadStats, loadNetwork };

        let latest: unknown = null;
        const rendered = await renderElement(createElement(ActiveProfileProbe, {
            pubkey: 'alice',
            service,
            onUpdate: (next: ActiveProfileProbeState) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => {
            const current = latest as ActiveProfileProbeState | null;
            return Boolean(current?.posts.some((post) => post.id === 'alice-post'));
        });

        await rendered.rerender(createElement(ActiveProfileProbe, {
            pubkey: 'bob',
            service,
            onUpdate: (next: ActiveProfileProbeState) => {
                latest = next;
            },
        }));
        await waitFor(() => {
            const current = latest as ActiveProfileProbeState | null;
            return Boolean(current?.posts.some((post) => post.id === 'bob-post'));
        });

        await rendered.rerender(createElement(ActiveProfileProbe, {
            pubkey: 'alice',
            service,
            onUpdate: (next: ActiveProfileProbeState) => {
                latest = next;
            },
        }));
        await waitFor(() => {
            const current = latest as ActiveProfileProbeState | null;
            return Boolean(current?.posts.some((post) => post.id === 'alice-post'));
        });

        const aliceCalls = loadPosts.mock.calls.filter((args) => args[0].pubkey === 'alice');
        expect(aliceCalls).toHaveLength(1);
    });

    test('supports pagination and dedupes posts by id', async () => {
        const loadPosts = vi.fn(async ({ until }: { pubkey: string; limit?: number; until?: number }) => {
            if (typeof until === 'number') {
                return page(['post-2', 'post-1'], false);
            }

            return page(['post-3', 'post-2'], true, 123);
        });
        const service: ActiveProfileQueryService = {
            loadPosts,
            loadStats: async () => ({ followsCount: 0, followersCount: 0 }),
            loadNetwork: async () => network(),
        };

        let latest: unknown = null;
        const rendered = await renderElement(createElement(ActiveProfileProbe, {
            pubkey: 'alice',
            service,
            onUpdate: (next: ActiveProfileProbeState) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => {
            const current = latest as ActiveProfileProbeState | null;
            return Boolean(current && current.posts.length === 2 && current.hasMorePosts);
        });

        await act(async () => {
            const current = latest as ActiveProfileProbeState | null;
            await current?.loadMorePosts();
        });

        await waitFor(() => {
            const current = latest as ActiveProfileProbeState | null;
            return Boolean(current && current.posts.length === 3 && !current.hasMorePosts);
        });
        const current = latest as ActiveProfileProbeState | null;
        const postIds = current ? current.posts.map((post: { id: string }) => post.id) : [];
        expect(postIds).toEqual(['post-3', 'post-2', 'post-1']);
        expect(loadPosts).toHaveBeenNthCalledWith(1, { pubkey: 'alice', limit: 10, until: undefined });
        expect(loadPosts).toHaveBeenNthCalledWith(2, { pubkey: 'alice', limit: 10, until: 123 });
    });

    test('falls back to network counts when stats query fails', async () => {
        const service: ActiveProfileQueryService = {
            loadPosts: async () => page([]),
            loadStats: async () => {
                throw new Error('stats unavailable');
            },
            loadNetwork: async () => network(['p1', 'p2'], ['p3', 'p4', 'p5']),
        };

        let latest: unknown = null;
        const rendered = await renderElement(createElement(ActiveProfileProbe, {
            pubkey: 'alice',
            service,
            onUpdate: (next: ActiveProfileProbeState) => {
                latest = next;
            },
        }));
        mounted.push(rendered);

        await waitFor(() => {
            const current = latest as ActiveProfileProbeState | null;
            return current?.statsError === 'stats unavailable' && current?.networkLoading === false;
        });
        const current = latest as ActiveProfileProbeState | null;
        const followsCount = current ? current.followsCount : 0;
        const followersCount = current ? current.followersCount : 0;
        expect(followsCount).toBe(2);
        expect(followersCount).toBe(3);
    });
});

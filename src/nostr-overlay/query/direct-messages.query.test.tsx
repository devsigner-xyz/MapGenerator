/** @vitest-environment jsdom */

import { act, createElement, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createNostrOverlayQueryClient } from './query-client';
import { createDmReadStateStorage, fallbackStorage } from './dm-storage';
import { useDirectMessagesController, type DirectMessagesService } from './direct-messages.query';

const OWNER = 'a'.repeat(64);

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface ProbeProps {
    ownerPubkey?: string;
    enabled?: boolean;
    dmService: DirectMessagesService;
    onUpdate: (next: ReturnType<typeof useDirectMessagesController>) => void;
}

function DirectMessagesProbe({ ownerPubkey, enabled, dmService, onUpdate }: ProbeProps): null {
    const state = useDirectMessagesController({
        ownerPubkey,
        enabled,
        dmService,
        storage: createDmReadStateStorage({
            storage: fallbackStorage,
            now: () => 100,
            version: 'v1',
        }),
        now: () => 100,
    });

    useEffect(() => {
        onUpdate(state);
    }, [onUpdate, state]);

    return null;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const queryClient = createNostrOverlayQueryClient();

    await act(async () => {
        root.render(createElement(QueryClientProvider, { client: queryClient }, element));
    });

    return {
        container,
        root,
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

describe('useDirectMessagesController', () => {
    test('does not subscribe or load when disabled', async () => {
        const dmService: DirectMessagesService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
        };

        const rendered = await renderElement(createElement(DirectMessagesProbe, {
            ownerPubkey: OWNER,
            enabled: false,
            dmService,
            onUpdate: () => {},
        }));
        mounted.push(rendered);

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(dmService.loadInitialConversations).not.toHaveBeenCalled();
        expect(dmService.subscribeInbox).not.toHaveBeenCalled();
    });

    test('subscribes and loads initial conversations when enabled', async () => {
        const dmService: DirectMessagesService = {
            subscribeInbox: vi.fn(() => () => {}),
            loadInitialConversations: vi.fn(async () => []),
        };

        const rendered = await renderElement(createElement(DirectMessagesProbe, {
            ownerPubkey: OWNER,
            enabled: true,
            dmService,
            onUpdate: () => {},
        }));
        mounted.push(rendered);

        await waitFor(() =>
            (dmService.loadInitialConversations as ReturnType<typeof vi.fn>).mock.calls.length > 0
            && (dmService.subscribeInbox as ReturnType<typeof vi.fn>).mock.calls.length > 0
        );

        expect(dmService.loadInitialConversations).toHaveBeenCalledWith({
            ownerPubkey: OWNER,
            sentIndex: [],
        });
        expect(dmService.subscribeInbox).toHaveBeenCalledWith({ ownerPubkey: OWNER }, expect.any(Function));
    });
});

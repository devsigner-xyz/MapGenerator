import { act, useEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeAll, beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { useDirectMessagesController, type DirectMessagesService } from '../query/direct-messages.query';
import { useOverlayDmController, type OverlayDmController } from './use-overlay-dm-controller';

vi.mock('../query/direct-messages.query', () => ({
    useDirectMessagesController: vi.fn(),
}));

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mountedRoots: RenderResult[] = [];

const service: DirectMessagesService = {
    subscribeInbox: () => () => {},
    loadInitialConversations: async () => [],
    loadConversationMessages: async () => [],
};

function createDmState(input: Partial<ReturnType<typeof useDirectMessagesController>> = {}): ReturnType<typeof useDirectMessagesController> {
    return {
        isListOpen: false,
        activeConversationId: null,
        conversations: {},
        hasUnreadGlobal: false,
        isBootstrapping: false,
        bootstrapError: null,
        openList: vi.fn(),
        openConversation: vi.fn(),
        markConversationRead: vi.fn(),
        sendMessage: vi.fn(),
        isSendingMessage: false,
        ...input,
    };
}

function Harness(props: {
    ownerPubkey?: string;
    canDirectMessages?: boolean;
    isChatsRoute?: boolean;
    locationSearch?: string;
    navigate?: (path: string, options?: { replace?: boolean }) => void;
    onController: (controller: OverlayDmController) => void;
}): ReactElement | null {
    const controller = useOverlayDmController({
        ...(props.ownerPubkey ? { ownerPubkey: props.ownerPubkey } : {}),
        canDirectMessages: props.canDirectMessages ?? false,
        isChatsRoute: props.isChatsRoute ?? false,
        locationSearch: props.locationSearch ?? '',
        navigate: props.navigate ?? vi.fn(),
        service,
    });

    useEffect(() => {
        props.onController(controller);
    }, [controller, props]);

    return null;
}

async function renderHarness(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    const result = { container, root };
    mountedRoots.push(result);
    return result;
}

async function flushEffects(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    vi.mocked(useDirectMessagesController).mockReset();
});

afterEach(() => {
    for (const { root, container } of mountedRoots.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
});

describe('useOverlayDmController', () => {
    test('selects the current conversation from route query params', async () => {
        const openConversation = vi.fn();
        vi.mocked(useDirectMessagesController).mockReturnValue(createDmState({ openConversation }));
        let latest: OverlayDmController | undefined;

        await renderHarness(
            <Harness
                ownerPubkey="owner"
                canDirectMessages
                isChatsRoute
                locationSearch="?peer=peer-a&compose=1"
                onController={(controller) => { latest = controller; }}
            />,
        );
        await flushEffects();

        expect(useDirectMessagesController).toHaveBeenCalledWith({ ownerPubkey: 'owner', dmService: service });
        expect(openConversation).toHaveBeenCalledWith('peer-a');
        expect(latest?.chatPinnedConversationId).toBe('peer-a');
        expect(latest?.chatActiveConversationId).toBe('peer-a');
        expect(latest?.chatComposerFocusKey).toContain('peer-a:');
    });

    test('opens the list route and exposes global unread state', async () => {
        const openList = vi.fn();
        vi.mocked(useDirectMessagesController).mockReturnValue(createDmState({ hasUnreadGlobal: true, openList }));
        let latest: OverlayDmController | undefined;

        await renderHarness(
            <Harness ownerPubkey="owner" canDirectMessages isChatsRoute onController={(controller) => { latest = controller; }} />,
        );
        await flushEffects();

        expect(openList).toHaveBeenCalledTimes(1);
        expect(latest?.chatState.hasUnreadGlobal).toBe(true);
        expect(latest?.canAccessDirectMessages).toBe(true);
        expect(latest?.chatActiveConversationId).toBeNull();
    });

    test('redirects inaccessible chat routes before selecting a conversation', async () => {
        const navigate = vi.fn();
        const openConversation = vi.fn();
        vi.mocked(useDirectMessagesController).mockReturnValue(createDmState({ openConversation }));

        await renderHarness(
            <Harness
                ownerPubkey="owner"
                canDirectMessages={false}
                isChatsRoute
                locationSearch="?peer=peer-a"
                navigate={navigate}
                onController={() => {}}
            />,
        );
        await flushEffects();

        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
        expect(openConversation).not.toHaveBeenCalled();
    });
});

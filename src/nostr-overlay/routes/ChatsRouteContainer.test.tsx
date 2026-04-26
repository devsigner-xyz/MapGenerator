import type { ComponentProps } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatsPage } from '../components/ChatsPage';
import { ChatsRouteContainer, type ChatsRouteContainerProps } from './ChatsRouteContainer';

vi.mock('../components/ChatsPage', () => ({
    ChatsPage: vi.fn(() => null),
}));

type ChatsPageProps = ComponentProps<typeof ChatsPage>;

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

const mountedRoots: RenderResult[] = [];

function buildProps(
    overrides: Partial<ChatsRouteContainerProps> = {},
    options: { withoutOwnerPubkey?: boolean } = {},
): ChatsRouteContainerProps {
    const props: ChatsRouteContainerProps = {
        ownerPubkey: 'owner-pubkey',
        canDirectMessages: true,
        hasUnreadGlobal: false,
        isLoadingConversations: false,
        conversations: [],
        messages: [],
        activeConversationId: 'peer-a',
        composerAutoFocusKey: 'peer-a:123',
        canSendChatMessages: true,
        onOpenConversation: vi.fn(),
        sendMessage: vi.fn(),
        ...overrides,
    };

    if (options.withoutOwnerPubkey) {
        delete props.ownerPubkey;
    }

    return props;
}

async function renderRoute(props: ChatsRouteContainerProps): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(<ChatsRouteContainer {...props} />);
    });

    const result = { container, root };
    mountedRoots.push(result);
    return result;
}

function getLatestChatsPageProps(): ChatsPageProps {
    const calls = vi.mocked(ChatsPage).mock.calls;
    const latestCall = calls[calls.length - 1];

    if (!latestCall) {
        throw new Error('ChatsPage was not rendered');
    }

    return latestCall[0];
}

beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

beforeEach(() => {
    vi.mocked(ChatsPage).mockClear();
});

afterEach(() => {
    for (const { root, container } of mountedRoots.splice(0)) {
        act(() => root.unmount());
        container.remove();
    }
});

describe('ChatsRouteContainer', () => {
    test('passes login disabled reason when there is no owner pubkey', async () => {
        await renderRoute(buildProps({ canSendChatMessages: false }, { withoutOwnerPubkey: true }));

        expect(getLatestChatsPageProps().disabledReason).toBe('Inicia sesión para enviar mensajes privados.');
    });

    test('passes NIP-44 disabled reason when direct messages are unavailable', async () => {
        await renderRoute(buildProps({ canDirectMessages: false, canSendChatMessages: false }));

        expect(getLatestChatsPageProps().disabledReason).toBe('Tu sesión no permite mensajería privada (requiere firma y NIP-44).');
    });

    test('calls onSendMessage with the active conversation only when sending is allowed', async () => {
        const sendMessage = vi.fn<ChatsRouteContainerProps['sendMessage']>();
        const props = buildProps({
            sendMessage,
            activeConversationId: 'peer-a',
            canSendChatMessages: true,
        });
        const rendered = await renderRoute(props);

        await act(async () => {
            await getLatestChatsPageProps().onSendMessage('hello');
        });

        expect(sendMessage).toHaveBeenCalledWith('peer-a', 'hello');

        await act(async () => {
            rendered.root.render(<ChatsRouteContainer {...props} canSendChatMessages={false} />);
        });
        await act(async () => {
            await getLatestChatsPageProps().onSendMessage('blocked');
        });

        expect(sendMessage).toHaveBeenCalledTimes(1);

        await act(async () => {
            rendered.root.render(<ChatsRouteContainer {...props} activeConversationId={null} />);
        });
        await act(async () => {
            await getLatestChatsPageProps().onSendMessage('without-active-conversation');
        });

        expect(sendMessage).toHaveBeenCalledTimes(1);
    });
});

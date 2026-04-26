import { useEffect, useMemo, useRef, useState } from 'react';
import { useDirectMessagesController, type DirectMessagesService } from '../query/direct-messages.query';

type DirectMessagesController = ReturnType<typeof useDirectMessagesController>;

interface UseOverlayDmControllerOptions {
    ownerPubkey?: string;
    canDirectMessages: boolean;
    isChatsRoute: boolean;
    locationSearch: string;
    navigate: (path: string, options?: { replace?: boolean }) => void;
    service: DirectMessagesService;
}

export interface OverlayDmController {
    directMessages: DirectMessagesController;
    chatState: DirectMessagesController;
    canAccessDirectMessages: boolean;
    chatPinnedConversationId: string | null;
    chatActiveConversationId: string | null;
    chatComposerFocusKey: string;
    setChatPinnedConversationId: (conversationId: string | null) => void;
    setChatComposerFocusKey: (focusKey: string) => void;
    openChatStateList: DirectMessagesController['openList'];
    openChatStateConversation: DirectMessagesController['openConversation'];
}

export function useOverlayDmController(options: UseOverlayDmControllerOptions): OverlayDmController {
    const [chatComposerFocusKey, setChatComposerFocusKey] = useState('');
    const [chatPinnedConversationId, setChatPinnedConversationId] = useState<string | null>(null);
    const chatRouteSyncKeyRef = useRef('');
    const canAccessDirectMessages = Boolean(options.ownerPubkey && options.canDirectMessages && options.service);
    const directMessages = useDirectMessagesController({
        ...(options.ownerPubkey ? { ownerPubkey: options.ownerPubkey } : {}),
        dmService: options.service,
    });
    const chatState = directMessages;
    const openChatStateList = chatState.openList;
    const openChatStateConversation = chatState.openConversation;
    const chatActiveConversationId = chatState.activeConversationId ?? chatPinnedConversationId;

    useEffect(() => {
        if (!options.isChatsRoute) {
            chatRouteSyncKeyRef.current = '';
            return;
        }

        if (!options.ownerPubkey) {
            return;
        }

        if (!canAccessDirectMessages) {
            options.navigate('/', { replace: true });
            return;
        }

        const syncKey = `${options.ownerPubkey}:${options.locationSearch}`;
        if (chatRouteSyncKeyRef.current === syncKey) {
            return;
        }
        chatRouteSyncKeyRef.current = syncKey;

        const params = new URLSearchParams(options.locationSearch);
        const peer = params.get('peer');
        const compose = params.get('compose') === '1';

        if (peer) {
            openChatStateConversation(peer);
            setChatPinnedConversationId(peer);
            if (compose) {
                setChatComposerFocusKey(`${peer}:${Date.now()}`);
            }
            return;
        }

        openChatStateList();
        setChatPinnedConversationId(null);
    }, [
        canAccessDirectMessages,
        openChatStateConversation,
        openChatStateList,
        options.isChatsRoute,
        options.locationSearch,
        options.navigate,
        options.ownerPubkey,
    ]);

    return useMemo(() => ({
        directMessages,
        chatState,
        canAccessDirectMessages,
        chatPinnedConversationId,
        chatActiveConversationId,
        chatComposerFocusKey,
        setChatPinnedConversationId,
        setChatComposerFocusKey,
        openChatStateList,
        openChatStateConversation,
    }), [
        canAccessDirectMessages,
        chatActiveConversationId,
        chatComposerFocusKey,
        chatPinnedConversationId,
        chatState,
        directMessages,
        openChatStateConversation,
        openChatStateList,
    ]);
}

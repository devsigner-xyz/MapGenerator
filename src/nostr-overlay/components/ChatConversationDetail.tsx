import { useEffect, useRef, useState } from 'react';
import type { ChatConversationSummary, ChatDetailMessage } from './ChatModal';

interface ChatConversationDetailProps {
    conversation?: ChatConversationSummary;
    messages: ChatDetailMessage[];
    onBackToList: () => void;
    onSendMessage: (plaintext: string) => Promise<void> | void;
    composerAutoFocusKey?: string;
    canSend?: boolean;
    disabledReason?: string;
}

function deliveryStatusLabel(state: 'pending' | 'sent' | 'failed'): string {
    if (state === 'pending') {
        return 'Enviando...';
    }

    if (state === 'failed') {
        return 'Error de entrega';
    }

    return 'Enviado';
}

export function ChatConversationDetail({
    conversation,
    messages,
    onBackToList,
    onSendMessage,
    composerAutoFocusKey,
    canSend = true,
    disabledReason,
}: ChatConversationDetailProps) {
    const [draft, setDraft] = useState('');
    const composerRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (!conversation || !composerRef.current) {
            return;
        }

        composerRef.current.focus();
    }, [conversation?.id, composerAutoFocusKey]);

    if (!conversation) {
        return <p className="nostr-chat-empty">Selecciona una conversación para empezar</p>;
    }

    return (
        <div className="nostr-chat-detail">
            <div className="nostr-chat-detail-header">
                <button type="button" className="nostr-chat-back" onClick={onBackToList}>
                    Volver
                </button>
                <p className="nostr-chat-detail-title">{conversation.title}</p>
            </div>

            <ul className="nostr-chat-messages">
                {messages.length === 0 ? <li className="nostr-chat-empty">Sin mensajes todavía</li> : null}
                {messages.map((message) => (
                    <li key={message.id} className={`nostr-chat-message ${message.direction === 'outgoing' ? 'is-outgoing' : 'is-incoming'}`}>
                        <p>
                            {message.isUndecryptable ? 'No se pudo desencriptar este mensaje' : message.plaintext}
                        </p>
                        {message.direction === 'outgoing' ? (
                            <p className={`nostr-chat-message-status is-${message.deliveryState}`}>
                                {deliveryStatusLabel(message.deliveryState)}
                            </p>
                        ) : null}
                    </li>
                ))}
            </ul>

            <form
                className="nostr-chat-composer"
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!canSend) {
                        return;
                    }

                    const plaintext = draft.trim();
                    if (!plaintext) {
                        return;
                    }

                    void onSendMessage(plaintext);
                    setDraft('');
                }}
            >
                <textarea
                    ref={composerRef}
                    className="nostr-chat-composer-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Escribe un mensaje..."
                    readOnly={!canSend}
                />
                <button type="submit" className="nostr-chat-send" disabled={!canSend || draft.trim().length === 0}>
                    Enviar
                </button>
            </form>
            {!canSend ? <p className="nostr-chat-empty">{disabledReason || 'El envío de mensajes está deshabilitado para esta sesión.'}</p> : null}
        </div>
    );
}

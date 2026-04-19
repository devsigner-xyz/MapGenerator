import { useEffect, useRef, useState } from 'react';
import type { ChatConversationSummary, ChatDetailMessage } from './ChatsPage';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Textarea } from '@/components/ui/textarea';

interface ChatConversationDetailProps {
    conversation?: ChatConversationSummary;
    messages: ChatDetailMessage[];
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

function formatMessageTimestamp(createdAt: number): string {
    return new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(new Date(createdAt * 1000));
}

export function ChatConversationDetail({
    conversation,
    messages,
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
        return (
            <div className="nostr-chat-empty-state">
                <Empty className="nostr-chat-empty">
                    <EmptyHeader>
                        <EmptyTitle>Sin conversacion activa</EmptyTitle>
                        <EmptyDescription>Selecciona una conversación para empezar.</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            </div>
        );
    }

    return (
        <div className="nostr-chat-detail">
            <div className="nostr-chat-detail-header">
                <p className="nostr-chat-detail-title">{conversation.title}</p>
            </div>

            <ul className="nostr-chat-messages">
                {messages.length === 0 ? (
                    <li>
                        <Empty className="nostr-chat-empty">
                            <EmptyHeader>
                                <EmptyTitle>Sin mensajes</EmptyTitle>
                                <EmptyDescription>Esta conversación aún no tiene mensajes.</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </li>
                ) : null}
                {messages.map((message) => (
                    <li key={message.id} className={`nostr-chat-message ${message.direction === 'outgoing' ? 'is-outgoing' : 'is-incoming'}`}>
                        <div className="nostr-chat-message-header">
                            <strong className="nostr-chat-message-author">
                                {message.direction === 'outgoing' ? 'Yo' : conversation.title}
                            </strong>
                            <span className="nostr-chat-message-timestamp">{formatMessageTimestamp(message.createdAt)}</span>
                        </div>
                        <p className="nostr-chat-message-body">
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
                <Textarea
                    ref={composerRef}
                    className="nostr-chat-composer-input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Escribe un mensaje..."
                    readOnly={!canSend}
                />
                <Button type="submit" className="nostr-chat-send" disabled={!canSend || draft.trim().length === 0}>
                    Enviar
                </Button>
            </form>
            {!canSend ? <p className="nostr-chat-disabled-note">{disabledReason || 'El envío de mensajes está deshabilitado para esta sesión.'}</p> : null}
        </div>
    );
}

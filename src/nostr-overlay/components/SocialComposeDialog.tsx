import { useEffect, useState } from 'react';
import type { SearchUsersResult } from '../query/user-search.query';
import { createMentionDraft, type MentionDraft } from '../mention-serialization';
import { MentionTextarea } from './MentionTextarea';
import type { NoteCardModel } from './note-card-model';
import { withoutNoteActions } from './note-card-model';
import { NoteCard } from './NoteCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import type { NostrProfile } from '../../nostr/types';

interface SocialComposeDialogProps {
    open: boolean;
    mode: 'post' | 'quote';
    quoteTarget?: NoteCardModel;
    profilesByPubkey: Record<string, NostrProfile>;
    isSubmitting?: boolean;
    onSearchUsers: (query: string) => Promise<SearchUsersResult>;
    searchRelaySetKey?: string | undefined;
    ownerPubkey?: string | undefined;
    onOpenChange: (open: boolean) => void;
    onSubmit: (content: MentionDraft) => Promise<void> | void;
}

export function SocialComposeDialog({
    open,
    mode,
    quoteTarget,
    profilesByPubkey,
    isSubmitting = false,
    onSearchUsers,
    searchRelaySetKey,
    ownerPubkey,
    onOpenChange,
    onSubmit,
}: SocialComposeDialogProps) {
    const [draft, setDraft] = useState<MentionDraft>(createMentionDraft(''));

    useEffect(() => {
        if (open) {
            setDraft(createMentionDraft(''));
        }
    }, [open, mode, quoteTarget?.id]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogTitle>{mode === 'quote' ? 'Cita' : 'Publicar'}</DialogTitle>
                <DialogDescription>
                    {mode === 'quote'
                        ? 'Escribe tu comentario sobre la nota seleccionada.'
                        : 'Escribe una nueva publicacion para Agora.'}
                </DialogDescription>

                <div className="grid gap-4">
                    <MentionTextarea
                        aria-label="Redactar publicacion"
                        placeholder={mode === 'quote' ? 'Anade tu comentario' : 'Que estas pensando?'}
                        value={draft}
                        onSearch={onSearchUsers}
                        ownerPubkey={ownerPubkey}
                        searchRelaySetKey={searchRelaySetKey}
                        onChangeDraft={setDraft}
                    />

                    {mode === 'quote' && quoteTarget ? (
                        <NoteCard
                            note={withoutNoteActions(quoteTarget)}
                            profilesByPubkey={profilesByPubkey}
                        />
                    ) : null}
                </div>

                <DialogFooter className="sm:justify-end">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        disabled={isSubmitting || draft.text.trim().length === 0}
                        onClick={() => {
                            void onSubmit(draft);
                        }}
                    >
                        {isSubmitting ? 'Publicando...' : 'Publicar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

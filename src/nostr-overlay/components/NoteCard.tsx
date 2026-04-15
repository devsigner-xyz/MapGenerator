import { HeartIcon, MessageCircleIcon, Repeat2Icon, ZapIcon } from 'lucide-react';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import { RichNostrContent } from './RichNostrContent';
import type { NoteActionState, NoteCardModel } from './note-card-model';
import { shortId } from './note-card-model';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@/components/ui/item';

export interface NoteCardProps {
    note: NoteCardModel;
    profilesByPubkey: Record<string, NostrProfile>;
    onCopyNoteId?: (noteId: string) => void;
    onSelectHashtag?: (hashtag: string) => void;
    onSelectProfile?: (pubkey: string) => void;
    onResolveProfiles?: (pubkeys: string[]) => Promise<void> | void;
    onSelectEventReference?: (eventId: string) => void;
    onResolveEventReferences?: (
        eventIds: string[],
        options?: { relayHintsByEventId?: Record<string, string[]> }
    ) => Promise<Record<string, NostrEvent> | void> | Record<string, NostrEvent> | void;
    eventReferencesById?: Record<string, NostrEvent>;
}

function formatCreatedAt(createdAt: number): { iso: string; label: string } {
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
        return {
            iso: new Date(0).toISOString(),
            label: 'Fecha desconocida',
        };
    }

    const date = new Date(createdAt * 1000);
    return {
        iso: date.toISOString(),
        label: date.toLocaleString(),
    };
}

function profileDisplayName(pubkey: string, profile: NostrProfile | undefined): string {
    return profile?.displayName || profile?.name || shortId(pubkey);
}

function profileInitials(pubkey: string, profile: NostrProfile | undefined): string {
    const label = profileDisplayName(pubkey, profile).trim();
    if (!label) {
        return pubkey.slice(0, 2).toUpperCase();
    }

    const words = label.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
        return words[0].slice(0, 2).toUpperCase();
    }

    return `${words[0]?.[0] || ''}${words[1]?.[0] || ''}`.toUpperCase();
}

function truncateTo140(content: string): string {
    const normalized = content.trim();
    if (!normalized) {
        return '(sin contenido)';
    }

    if (normalized.length <= 140) {
        return normalized;
    }

    return `${normalized.slice(0, 140)}...`;
}

interface NoteHeaderItemProps {
    note: NoteCardModel;
    profile: NostrProfile | undefined;
    onCopyNoteId?: (noteId: string) => void;
}

function NoteHeaderItem({ note, profile, onCopyNoteId }: NoteHeaderItemProps) {
    const publishedAt = formatCreatedAt(note.createdAt);
    const authorName = profileDisplayName(note.pubkey, profile);

    return (
        <Item variant="outline">
            <ItemMedia>
                <Avatar>
                    {profile?.picture ? <AvatarImage src={profile.picture} alt={authorName} /> : null}
                    <AvatarFallback>{profileInitials(note.pubkey, profile)}</AvatarFallback>
                </Avatar>
            </ItemMedia>

            <ItemContent className="min-w-0">
                <ItemTitle>{authorName}</ItemTitle>
                <ItemDescription>
                    {note.kindLabel ? <span>{note.kindLabel} · </span> : null}
                    <span>{shortId(note.pubkey)} · </span>
                    <span>{shortId(note.id)}</span>
                </ItemDescription>
            </ItemContent>

            <ItemActions>
                <time dateTime={publishedAt.iso}>{publishedAt.label}</time>
                {note.showCopyId && onCopyNoteId ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Copiar identificador de nota ${note.id}`}
                        onClick={() => onCopyNoteId(note.id)}
                    >
                        Copiar
                    </Button>
                ) : null}
            </ItemActions>
        </Item>
    );
}

interface NoteActionGroupProps {
    actions: NoteActionState;
}

function NoteActionGroup({ actions }: NoteActionGroupProps) {
    return (
        <ButtonGroup>
            <Button type="button" variant="ghost" size="sm" aria-label={`Responder (${actions.replies})`} onClick={actions.onReply}>
                <MessageCircleIcon data-icon="inline-start" aria-hidden="true" />
                <span>{actions.replies}</span>
            </Button>

            <Button
                type="button"
                variant={actions.isReactionActive ? 'default' : 'ghost'}
                size="sm"
                disabled={actions.isReactionPending || !actions.canWrite}
                aria-label={`Reaccionar (${actions.reactions})`}
                onClick={() => {
                    void actions.onToggleReaction();
                }}
            >
                <HeartIcon data-icon="inline-start" aria-hidden="true" />
                <span>{actions.reactions}</span>
            </Button>

            <Button
                type="button"
                variant={actions.isRepostActive ? 'default' : 'ghost'}
                size="sm"
                disabled={actions.isRepostPending || !actions.canWrite}
                aria-label={`Repostear (${actions.reposts})`}
                onClick={() => {
                    void actions.onToggleRepost();
                }}
            >
                <Repeat2Icon data-icon="inline-start" aria-hidden="true" />
                <span>{actions.reposts}</span>
            </Button>

            <ButtonGroupText aria-label={`Sats recibidos: ${actions.zapSats}`}>
                <ZapIcon aria-hidden="true" />
                <span>{actions.zapSats}</span>
            </ButtonGroupText>
        </ButtonGroup>
    );
}

export function NoteCard({
    note,
    profilesByPubkey,
    onCopyNoteId,
    onSelectHashtag,
    onSelectProfile,
    onResolveProfiles,
    onSelectEventReference,
    onResolveEventReferences,
    eventReferencesById,
}: NoteCardProps) {
    const isDeepNested = note.nestingLevel >= 2;
    const profile = profilesByPubkey[note.pubkey];

    return (
        <article>
            <Card size={note.variant === 'nested' ? 'sm' : 'default'}>
                <CardHeader>
                    <NoteHeaderItem note={note} profile={profile} onCopyNoteId={onCopyNoteId} />
                </CardHeader>

                <CardContent>
                    {isDeepNested ? (
                        <div aria-live="polite" className="flex flex-col gap-2">
                            <p>Nota referenciada</p>
                            <p>{truncateTo140(note.content)}</p>
                            <p>{shortId(note.id)}</p>
                            {onSelectEventReference ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label={`Abrir nota referenciada ${note.id}`}
                                    onClick={() => onSelectEventReference(note.id)}
                                >
                                    Abrir nota
                                </Button>
                            ) : null}
                        </div>
                    ) : (
                        <RichNostrContent
                            content={note.content}
                            tags={note.tags}
                            onSelectHashtag={onSelectHashtag}
                            onSelectProfile={onSelectProfile}
                            onResolveProfiles={onResolveProfiles}
                            onSelectEventReference={onSelectEventReference}
                            onResolveEventReferences={onResolveEventReferences}
                            eventReferencesById={eventReferencesById}
                            profilesByPubkey={profilesByPubkey}
                            emptyFallback={<p>(sin contenido)</p>}
                        />
                    )}
                </CardContent>

                {note.actions ? (
                    <CardFooter>
                        <NoteActionGroup actions={note.actions} />
                    </CardFooter>
                ) : null}
            </Card>
        </article>
    );
}

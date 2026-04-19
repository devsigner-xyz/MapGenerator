import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { EllipsisVerticalIcon, HeartIcon, MessageCircleIcon, Repeat2Icon, ZapIcon } from 'lucide-react';
import type { NostrEvent, NostrProfile } from '../../nostr/types';
import { RichNostrContent } from './RichNostrContent';
import { fromResolvedReferenceEvent } from './note-card-adapters';
import type { NoteActionState, NoteCardModel } from './note-card-model';
import { shortId } from './note-card-model';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ButtonGroup, ButtonGroupText } from '@/components/ui/button-group';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
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
        return (words[0] ?? '').slice(0, 2).toUpperCase();
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

const MAX_NESTED_VISIBLE = 3;
const MAX_REFERENCES_VISIBLE = 2;

interface VisibleNestedEntries {
    visibleEntries: Array<{ key: string; note: NoteCardModel }>;
    hiddenReferencesCount: number;
}

function buildVisibleNestedEntries(note: NoteCardModel): VisibleNestedEntries {
    const visibleEntries: Array<{ key: string; note: NoteCardModel }> = [];
    const referencedNotes = note.referencedNotes ?? [];

    if (note.embedded) {
        visibleEntries.push({ key: `embedded-${note.embedded.id}`, note: note.embedded });
    }

    const remainingTotalSlots = Math.max(0, MAX_NESTED_VISIBLE - visibleEntries.length);
    const allowedReferenceSlots = Math.min(MAX_REFERENCES_VISIBLE, remainingTotalSlots);
    const visibleReferences = referencedNotes.slice(0, allowedReferenceSlots);
    visibleEntries.push(...visibleReferences.map((nestedNote) => ({ key: `reference-${nestedNote.id}`, note: nestedNote })));

    return {
        visibleEntries,
        hiddenReferencesCount: Math.max(0, referencedNotes.length - visibleReferences.length),
    };
}

interface NoteHeaderItemProps {
    note: NoteCardModel;
    profile: NostrProfile | undefined;
}

function NoteHeaderItem({ note, profile }: NoteHeaderItemProps) {
    const publishedAt = formatCreatedAt(note.createdAt);
    const authorName = profileDisplayName(note.pubkey, profile);

    return (
        <Item>
            <ItemMedia>
                <Avatar size="lg">
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
            </ItemActions>
        </Item>
    );
}

interface NoteActionGroupProps {
    actions: NoteActionState;
}

interface NoteActionsMenuProps {
    noteId: string;
    onCopyNoteId?: (noteId: string) => void;
    onViewDetail?: () => void;
}

function NoteActionsMenu({ noteId, onCopyNoteId, onViewDetail }: NoteActionsMenuProps) {
    if (!onCopyNoteId && !onViewDetail) {
        return null;
    }

    const openMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Abrir acciones para la nota ${noteId}`}
                    onClick={openMenu}
                >
                    <EllipsisVerticalIcon aria-hidden="true" />
                </Button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-40">
                <ContextMenuGroup>
                    {onViewDetail ? (
                        <ContextMenuItem aria-label={`Ver detalle de la nota ${noteId}`} onSelect={() => onViewDetail()}>
                            Ver detalle
                        </ContextMenuItem>
                    ) : null}
                    {onCopyNoteId ? (
                        <ContextMenuItem aria-label={`Copiar identificador de nota ${noteId}`} onSelect={() => onCopyNoteId(noteId)}>
                        Copiar
                        </ContextMenuItem>
                    ) : null}
                </ContextMenuGroup>
            </ContextMenuContent>
        </ContextMenu>
    );
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
    const { visibleEntries, hiddenReferencesCount } = buildVisibleNestedEntries(note);
    const noteCardSharedProps = {
        ...(onCopyNoteId ? { onCopyNoteId } : {}),
        ...(onSelectHashtag ? { onSelectHashtag } : {}),
        ...(onSelectProfile ? { onSelectProfile } : {}),
        ...(onResolveProfiles ? { onResolveProfiles } : {}),
        ...(onSelectEventReference ? { onSelectEventReference } : {}),
        ...(onResolveEventReferences ? { onResolveEventReferences } : {}),
        ...(eventReferencesById ? { eventReferencesById } : {}),
    };

    const renderNestedReference = (eventId: string, event: NostrEvent | undefined, nestingLevel: number): ReactNode => {
        if (!event) {
            return (
                <article aria-live="polite">
                    <p>Cargando nota referenciada...</p>
                </article>
            );
        }

        const nestedNote = fromResolvedReferenceEvent(event, nestingLevel);
        if (!nestedNote) {
            return (
                <article aria-live="polite">
                    <p>No se pudo renderizar la nota referenciada.</p>
                    {onSelectEventReference ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Abrir nota referenciada ${eventId}`}
                            onClick={() => onSelectEventReference(eventId)}
                        >
                            Abrir nota
                        </Button>
                    ) : null}
                </article>
            );
        }

        return (
            <div>
                <NoteCard
                    note={nestedNote}
                    profilesByPubkey={profilesByPubkey}
                    {...noteCardSharedProps}
                />
                {onSelectEventReference ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Abrir nota referenciada ${eventId}`}
                        onClick={() => onSelectEventReference(eventId)}
                    >
                        Abrir nota
                    </Button>
                ) : null}
            </div>
        );
    };

    const renderNestedModel = (nestedNote: NoteCardModel, key: string) => {
        return (
            <NoteCard
                key={key}
                note={nestedNote}
                profilesByPubkey={profilesByPubkey}
                {...noteCardSharedProps}
            />
        );
    };

    const openDetail = note.actions?.onViewDetail;
    const handleCardClick = (event: ReactMouseEvent<HTMLElement>): void => {
        if (!openDetail) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, [role="button"], [data-slot="context-menu-item"], [data-slot="context-menu-content"]')) {
            return;
        }

        openDetail();
    };

    return (
        <article onClick={handleCardClick} className={openDetail ? 'cursor-pointer' : undefined}>
            <Card size={note.variant === 'nested' ? 'sm' : 'default'}>
                <CardHeader>
                    <NoteHeaderItem
                        note={note}
                        profile={profile}
                    />
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
                            {...(onSelectHashtag ? { onSelectHashtag } : {})}
                            {...(onSelectProfile ? { onSelectProfile } : {})}
                            {...(onResolveProfiles ? { onResolveProfiles } : {})}
                            {...(onSelectEventReference ? { onSelectEventReference } : {})}
                            {...(onResolveEventReferences ? { onResolveEventReferences } : {})}
                            {...(eventReferencesById ? { eventReferencesById } : {})}
                            renderEventReferenceCard={({ eventId, event }) => renderNestedReference(eventId, event, note.nestingLevel + 1)}
                            profilesByPubkey={profilesByPubkey}
                            emptyFallback={<p>(sin contenido)</p>}
                        />
                    )}

                    {!isDeepNested ? visibleEntries.map((entry) => renderNestedModel(entry.note, entry.key)) : null}
                    {!isDeepNested && hiddenReferencesCount > 0 ? <p>+{hiddenReferencesCount} referencias adicionales</p> : null}
                </CardContent>

                {note.actions || (note.showCopyId && onCopyNoteId) ? (
                    <CardFooter className="items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            {note.actions ? <NoteActionGroup actions={note.actions} /> : null}
                        </div>
                        {(note.showCopyId || note.actions?.onViewDetail)
                            ? <NoteActionsMenu noteId={note.id} {...(onCopyNoteId ? { onCopyNoteId } : {})} {...(note.actions?.onViewDetail ? { onViewDetail: note.actions.onViewDetail } : {})} />
                            : null}
                    </CardFooter>
                ) : null}
            </Card>
        </article>
    );
}

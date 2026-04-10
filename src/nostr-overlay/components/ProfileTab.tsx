import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { EllipsisVerticalIcon } from 'lucide-react';
import type { Nip05ValidationResult } from '../../nostr/nip05';
import type { AuthSessionState } from '../../nostr/auth/session';
import type { NostrProfile } from '../../nostr/types';
import { encodeHexToNpub } from '../../nostr/npub';
import { Nip05Identifier } from './Nip05Identifier';
import { PersonContextMenuItems } from './PersonContextMenuItems';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuTrigger } from '@/components/ui/context-menu';

interface ProfileTabProps {
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    followsCount: number;
    followersCount: number;
    followersLoading: boolean;
    authSession?: AuthSessionState;
    canWrite?: boolean;
    canEncrypt?: boolean;
    onLocateOwner?: () => void;
    onCopyOwnerNpub?: (value: string) => void | Promise<void>;
    ownerVerification?: Nip05ValidationResult;
}

function displayName(profile: NostrProfile | undefined, fallback: string): string {
    return profile?.displayName ?? profile?.name ?? fallback;
}

export function ProfileTab({
    ownerPubkey,
    ownerProfile,
    followsCount,
    followersCount,
    followersLoading,
    authSession,
    canWrite = false,
    canEncrypt = false,
    onLocateOwner,
    onCopyOwnerNpub,
    ownerVerification,
}: ProfileTabProps) {
    const [avatarLoadError, setAvatarLoadError] = useState(false);

    const openActionsMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
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

    useEffect(() => {
        setAvatarLoadError(false);
    }, [ownerProfile?.picture]);

    if (!ownerPubkey) {
        return (
            <div className="nostr-profile-tab">
                <p className="nostr-auth-hint">
                    {authSession
                        ? authSession.readonly
                            ? 'Modo solo lectura. Inicia sesion con nsec o extension para interactuar con Nostr.'
                            : authSession.locked
                                ? 'Sesion bloqueada. Desbloquea para seguir, publicar y enviar mensajes privados.'
                                : 'Sesion lista para seguir, publicar y enviar mensajes privados.'
                        : 'Elige un metodo de login para continuar.'}
                </p>
            </div>
        );
    }

    const shortPubkey = `${ownerPubkey.slice(0, 10)}...${ownerPubkey.slice(-6)}`;
    let ownerNpub: string | undefined;
    try {
        ownerNpub = encodeHexToNpub(ownerPubkey);
    } catch {
        ownerNpub = undefined;
    }

    const pubkeyLabel = ownerNpub
        ? `${ownerNpub.slice(0, 14)}...${ownerNpub.slice(-6)}`
        : shortPubkey;

    return (
        <div className="nostr-profile-tab">
            <div className="nostr-profile-header">
                <div className="nostr-profile-header-main">
                    {ownerProfile?.picture && !avatarLoadError ? (
                        <Avatar className="nostr-profile-avatar">
                            <AvatarImage
                                src={ownerProfile.picture}
                                alt="Avatar de perfil"
                                onError={() => setAvatarLoadError(true)}
                            />
                            <AvatarFallback className="nostr-profile-avatar-fallback" aria-hidden="true">
                                {displayName(ownerProfile, ownerPubkey).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    ) : (
                        <Avatar className="nostr-profile-avatar">
                            <AvatarFallback className="nostr-profile-avatar-fallback" aria-hidden="true">
                                {displayName(ownerProfile, ownerPubkey).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    )}

                    <div>
                        <p className="nostr-profile-name nostr-identity-row">
                            <span className="truncate">{displayName(ownerProfile, shortPubkey)}</span>
                            <Nip05Identifier profile={ownerProfile} verification={ownerVerification} />
                        </p>
                        <p className="nostr-profile-pubkey">{pubkeyLabel}</p>
                    </div>
                </div>

                <div className="nostr-profile-actions" aria-label="Acciones de perfil">
                    <ContextMenu>
                        <ContextMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                className="nostr-icon-button"
                                aria-label="Abrir acciones de perfil"
                                title="Profile actions"
                                onClick={openActionsMenu}
                            >
                                <EllipsisVerticalIcon data-icon="inline-start" />
                            </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                            <ContextMenuGroup>
                                <PersonContextMenuItems
                                    onLocateOnMap={onLocateOwner}
                                    onCopyNpub={() => onCopyOwnerNpub?.(ownerNpub || ownerPubkey)}
                                />
                            </ContextMenuGroup>
                        </ContextMenuContent>
                    </ContextMenu>
                </div>
            </div>

            <dl className="nostr-profile-stats">
                <div>
                    <dt>Sigues</dt>
                    <dd>{followsCount}</dd>
                </div>
                <div>
                    <dt>Seguidores</dt>
                    <dd>{followersCount}</dd>
                </div>
            </dl>

            <p className="nostr-auth-hint" role="status" aria-live="polite">
                {!authSession
                    ? 'Inicia sesion para interactuar: seguir, publicar y mensajes privados.'
                    : authSession.locked
                        ? 'Sesion bloqueada. Desbloquea para firmar eventos.'
                        : canWrite
                            ? canEncrypt
                                ? 'Listo para interactuar con Nostr: seguir, publicar y mensajes privados.'
                                : 'Listo para publicar y seguir. Cifrado no disponible en este metodo.'
                            : 'Modo exploracion activo.'}
            </p>
        </div>
    );
}

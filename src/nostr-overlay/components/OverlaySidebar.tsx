import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
    BellIcon,
    ChartColumnIcon,
    ChevronsUpDownIcon,
    LogOutIcon,
    MapPinIcon,
    MessageCircleIcon,
    PanelLeftIcon,
    RefreshCcwIcon,
    SearchIcon,
    Settings2Icon,
    UserRoundIcon,
    UsersIcon,
} from 'lucide-react';
import { encodeHexToNpub } from '../../nostr/npub';
import type { AuthSessionState } from '../../nostr/auth/session';
import type { NostrProfile } from '../../nostr/types';
import type { SettingsView } from './MapSettingsDialog';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarRail,
    useSidebar,
} from '@/components/ui/sidebar';

export const OVERLAY_SIDEBAR_EXPANDED_WIDTH = 380;
export const OVERLAY_SIDEBAR_COLLAPSED_WIDTH = 56;

interface OverlaySidebarProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    authSession?: AuthSessionState;
    ownerPubkey?: string;
    ownerProfile?: NostrProfile;
    canAccessDirectMessages: boolean;
    canAccessSocialNotifications: boolean;
    canAccessFollowingFeed: boolean;
    chatHasUnread: boolean;
    notificationsHasUnread: boolean;
    followingFeedHasUnread: boolean;
    regenerateDisabled: boolean;
    onOpenCityStats: () => void;
    onOpenChat: () => void;
    onOpenNotifications: () => void;
    onOpenFollowingFeed: () => void;
    onOpenGlobalSearch: () => void;
    onRegenerateMap: () => void | Promise<void>;
    onOpenSettings: (view: SettingsView) => void;
    onLogout?: () => void | Promise<void>;
    onCopyOwnerNpub?: (value: string) => void | Promise<void>;
    onLocateOwner?: () => void;
    onViewOwnerDetails?: () => void;
    children: ReactNode;
}

function resolveDisplayName(profile: NostrProfile | undefined, fallback: string): string {
    return profile?.displayName ?? profile?.name ?? fallback;
}

function resolveInitials(profile: NostrProfile | undefined, fallback: string): string {
    return resolveDisplayName(profile, fallback).slice(0, 2).toUpperCase();
}

function SidebarActionsMenu({
    authSession,
    canAccessDirectMessages,
    canAccessSocialNotifications,
    canAccessFollowingFeed,
    chatHasUnread,
    notificationsHasUnread,
    followingFeedHasUnread,
    regenerateDisabled,
    onOpenCityStats,
    onOpenChat,
    onOpenNotifications,
    onOpenFollowingFeed,
    onOpenGlobalSearch,
    onRegenerateMap,
    onOpenSettings,
    onLogout,
}: Omit<OverlaySidebarProps, 'open' | 'onOpenChange' | 'ownerPubkey' | 'ownerProfile' | 'onCopyOwnerNpub' | 'onLocateOwner' | 'onViewOwnerDetails' | 'children'>) {
    const { state, isMobile, toggleSidebar } = useSidebar();
    const collapsed = state === 'collapsed';
    const toggleAriaLabel = collapsed ? 'Mostrar panel' : 'Ocultar panel';
    const toggleTitle = collapsed ? 'Show panel' : 'Hide panel';

    const settingsMenu = (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <SidebarMenuButton asChild>
                    <button type="button" aria-label="Abrir ajustes" title="Settings">
                        <Settings2Icon />
                        <span>Ajustes</span>
                    </button>
                </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="min-w-52 rounded-lg"
                side={isMobile ? 'bottom' : 'right'}
                align={isMobile ? 'end' : 'start'}
            >
                <DropdownMenuItem onSelect={() => onOpenSettings('ui')}>UI</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenSettings('shortcuts')}>Shortcuts</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenSettings('relays')}>Relays</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenSettings('zaps')}>Zaps</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenSettings('about')}>About</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenSettings('advanced')}>Advanced settings</DropdownMenuItem>
                {authSession ? (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => {
                            void onLogout?.();
                        }}>
                            Cerrar sesión
                        </DropdownMenuItem>
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );

    return (
        <SidebarGroup className="pt-1 pb-0">
            {!collapsed ? (
                <div className="nostr-panel-toolbar-status">
                    {authSession?.readonly ? <Badge variant="outline">Read Only</Badge> : null}
                </div>
            ) : null}
            <SidebarMenu className={cn('nostr-panel-toolbar flex flex-col gap-1', collapsed && 'nostr-compact-toolbar')}>
                {collapsed ? (
                    <>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                                <button type="button" aria-label={toggleAriaLabel} title={toggleTitle} onClick={toggleSidebar}>
                                    <PanelLeftIcon className="rotate-180" />
                                    <span>{toggleAriaLabel}</span>
                                </button>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>{settingsMenu}</SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                                <button
                                    type="button"
                                    aria-label="Abrir buscador global de usuarios"
                                    title="Buscar usuarios"
                                    onClick={onOpenGlobalSearch}
                                >
                                    <SearchIcon />
                                    <span>Buscar usuarios</span>
                                </button>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </>
                ) : (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <button
                                type="button"
                                aria-label="Abrir estadisticas de la ciudad"
                                title="City stats"
                                onClick={onOpenCityStats}
                            >
                                <ChartColumnIcon />
                                <span>Estadisticas</span>
                            </button>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                )}

                {canAccessDirectMessages ? (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <button
                                type="button"
                                className="nostr-chat-icon-button"
                                aria-label="Abrir chats"
                                title="Chats"
                                onClick={onOpenChat}
                            >
                                <MessageCircleIcon />
                                <span>Chats</span>
                                {chatHasUnread ? <span className="nostr-chat-unread-dot" /> : null}
                            </button>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ) : null}

                {canAccessSocialNotifications ? (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <button
                                type="button"
                                className="nostr-notifications-icon-button"
                                aria-label="Abrir notificaciones"
                                title="Notificaciones"
                                onClick={onOpenNotifications}
                            >
                                <BellIcon />
                                <span>Notificaciones</span>
                                {notificationsHasUnread ? <span className="nostr-notifications-unread-dot" /> : null}
                            </button>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ) : null}

                {canAccessFollowingFeed ? (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <button
                                type="button"
                                className="nostr-following-feed-icon-button"
                                aria-label="Abrir feed de seguidos"
                                title="Feed de seguidos"
                                onClick={onOpenFollowingFeed}
                            >
                                <UsersIcon />
                                <span>Feed</span>
                                {followingFeedHasUnread ? <span className="nostr-following-feed-unread-dot" /> : null}
                            </button>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ) : null}

                <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                        <button
                            type="button"
                            aria-label="Regenerar mapa"
                            title="New map"
                            onClick={() => {
                                void onRegenerateMap();
                            }}
                            disabled={regenerateDisabled}
                        >
                            <RefreshCcwIcon />
                            <span>Regenerar mapa</span>
                        </button>
                    </SidebarMenuButton>
                </SidebarMenuItem>

                {collapsed ? (
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <button
                                type="button"
                                aria-label="Abrir estadisticas de la ciudad"
                                title="City stats"
                                onClick={onOpenCityStats}
                            >
                                <ChartColumnIcon />
                                <span>Estadisticas</span>
                            </button>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ) : (
                    <>
                        <SidebarMenuItem>{settingsMenu}</SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                                <button
                                    type="button"
                                    aria-label="Abrir buscador global de usuarios"
                                    title="Buscar usuarios"
                                    onClick={onOpenGlobalSearch}
                                >
                                    <SearchIcon />
                                    <span>Buscar usuarios</span>
                                </button>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild>
                                <button type="button" aria-label={toggleAriaLabel} title={toggleTitle} onClick={toggleSidebar}>
                                    <PanelLeftIcon />
                                    <span>{toggleAriaLabel}</span>
                                </button>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </>
                )}
            </SidebarMenu>
        </SidebarGroup>
    );
}

function SidebarUserMenu({
    authSession,
    ownerPubkey,
    ownerProfile,
    onCopyOwnerNpub,
    onLocateOwner,
    onViewOwnerDetails,
    onLogout,
}: Pick<OverlaySidebarProps, 'authSession' | 'ownerPubkey' | 'ownerProfile' | 'onCopyOwnerNpub' | 'onLocateOwner' | 'onViewOwnerDetails' | 'onLogout'>) {
    const { isMobile } = useSidebar();

    if (!ownerPubkey) {
        return null;
    }

    const shortPubkey = `${ownerPubkey.slice(0, 10)}...${ownerPubkey.slice(-6)}`;
    const ownerName = resolveDisplayName(ownerProfile, shortPubkey);
    const ownerFallback = resolveInitials(ownerProfile, ownerPubkey);
    let ownerNpub: string | undefined;
    try {
        ownerNpub = encodeHexToNpub(ownerPubkey);
    } catch {
        ownerNpub = undefined;
    }

    const ownerLabel = ownerNpub
        ? `${ownerNpub.slice(0, 14)}...${ownerNpub.slice(-6)}`
        : shortPubkey;

    return (
        <SidebarFooter className="pt-0">
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                                size="lg"
                                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                                aria-label="Abrir menu de usuario"
                                title="Profile actions"
                            >
                                <Avatar className="h-8 w-8 rounded-lg">
                                    <AvatarImage src={ownerProfile?.picture} alt="Avatar de perfil" />
                                    <AvatarFallback className="rounded-lg">{ownerFallback}</AvatarFallback>
                                </Avatar>
                                <div className="grid flex-1 text-left text-sm leading-tight">
                                    <span className="truncate font-medium">{ownerName}</span>
                                    <span className="truncate text-xs">{ownerLabel}</span>
                                </div>
                                <ChevronsUpDownIcon className="ml-auto" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="min-w-56 rounded-lg"
                            side={isMobile ? 'bottom' : 'right'}
                            align="end"
                        >
                            <DropdownMenuLabel className="p-0 font-normal">
                                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                                    <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src={ownerProfile?.picture} alt="Avatar de perfil" />
                                        <AvatarFallback className="rounded-lg">{ownerFallback}</AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-medium">{ownerName}</span>
                                        <span className="truncate text-xs">{ownerLabel}</span>
                                    </div>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => {
                                void onCopyOwnerNpub?.(ownerNpub || ownerPubkey);
                            }}>
                                <UserRoundIcon />
                                Copiar npub
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => {
                                onLocateOwner?.();
                            }}>
                                <MapPinIcon />
                                Ubicar en el mapa
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => {
                                onViewOwnerDetails?.();
                            }}>
                                <SearchIcon />
                                Ver detalles
                            </DropdownMenuItem>
                            {authSession ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onSelect={() => {
                                            void onLogout?.();
                                        }}
                                    >
                                        <LogOutIcon />
                                        Cerrar sesión
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
    );
}

export function OverlaySidebar({
    open,
    onOpenChange,
    authSession,
    ownerPubkey,
    ownerProfile,
    canAccessDirectMessages,
    canAccessSocialNotifications,
    canAccessFollowingFeed,
    chatHasUnread,
    notificationsHasUnread,
    followingFeedHasUnread,
    regenerateDisabled,
    onOpenCityStats,
    onOpenChat,
    onOpenNotifications,
    onOpenFollowingFeed,
    onOpenGlobalSearch,
    onRegenerateMap,
    onOpenSettings,
    onLogout,
    onCopyOwnerNpub,
    onLocateOwner,
    onViewOwnerDetails,
    children,
}: OverlaySidebarProps) {
    const providerStyle = useMemo(() => ({
        '--sidebar-width': `${OVERLAY_SIDEBAR_EXPANDED_WIDTH}px`,
        '--sidebar-width-icon': `${OVERLAY_SIDEBAR_COLLAPSED_WIDTH}px`,
    }) as CSSProperties, []);

    return (
        <SidebarProvider open={open} onOpenChange={onOpenChange} style={providerStyle}>
            <Sidebar collapsible="icon">
                <SidebarHeader>
                    <SidebarActionsMenu
                        authSession={authSession}
                        canAccessDirectMessages={canAccessDirectMessages}
                        canAccessSocialNotifications={canAccessSocialNotifications}
                        canAccessFollowingFeed={canAccessFollowingFeed}
                        chatHasUnread={chatHasUnread}
                        notificationsHasUnread={notificationsHasUnread}
                        followingFeedHasUnread={followingFeedHasUnread}
                        regenerateDisabled={regenerateDisabled}
                        onOpenCityStats={onOpenCityStats}
                        onOpenChat={onOpenChat}
                        onOpenNotifications={onOpenNotifications}
                        onOpenFollowingFeed={onOpenFollowingFeed}
                        onOpenGlobalSearch={onOpenGlobalSearch}
                        onRegenerateMap={onRegenerateMap}
                        onOpenSettings={onOpenSettings}
                        onLogout={onLogout}
                    />
                </SidebarHeader>
                <SidebarContent>
                    <SidebarGroup className="min-h-0 flex-1 pt-1">
                        {children}
                    </SidebarGroup>
                </SidebarContent>
                <SidebarUserMenu
                    authSession={authSession}
                    ownerPubkey={ownerPubkey}
                    ownerProfile={ownerProfile}
                    onCopyOwnerNpub={onCopyOwnerNpub}
                    onLocateOwner={onLocateOwner}
                    onViewOwnerDetails={onViewOwnerDetails}
                    onLogout={onLogout}
                />
                <SidebarRail />
            </Sidebar>
        </SidebarProvider>
    );
}

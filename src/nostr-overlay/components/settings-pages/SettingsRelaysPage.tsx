import type { MouseEvent, ReactElement } from 'react';
import type { RelayType } from '../../../nostr/relay-settings';
import type { RelayConnectionStatus } from '../../hooks/useRelayConnectionSummary';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDownIcon, EllipsisVerticalIcon } from 'lucide-react';
import { OverlayPageHeader } from '../OverlayPageHeader';
import type { RelayDetails, RelayInformationDocument, RelayRow, RelaySource } from './types';

interface SettingsRelaysPageProps {
    configuredRows: RelayRow[];
    suggestedRows: RelayRow[];
    connectedConfiguredRelays: number;
    disconnectedConfiguredRelays: number;
    relayInfoByUrl: Record<string, { data?: RelayInformationDocument }>;
    configuredRelayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayTypeLabels: Record<RelayType, string>;
    newRelayInput: string;
    newRelayType: RelayType;
    invalidRelayInputs: string[];
    onNewRelayInputChange: (value: string) => void;
    onNewRelayTypeChange: (value: RelayType) => void;
    onAddRelays: () => void;
    onOpenRelayDetails: (relayUrl: string, source: RelaySource, relayType: RelayType) => void;
    onRemoveRelay: (relayUrl: string) => void;
    onAddSuggestedRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedRelays: () => void;
    onResetRelaysToDefault: () => void;
    onOpenRelayActionsMenu: (event: MouseEvent<HTMLButtonElement>) => void;
    describeRelay: (relayUrl: string, source: RelaySource) => RelayDetails;
    relayAvatarFallback: (details: RelayDetails, document?: RelayInformationDocument) => string;
    relayConnectionBadge: (status: RelayConnectionStatus | undefined) => ReactElement;
}

function compactRelayTypes(relayTypes: RelayType[]): RelayType[] {
    const hasBoth = relayTypes.includes('nip65Both');
    const hasRead = relayTypes.includes('nip65Read');
    const hasWrite = relayTypes.includes('nip65Write');
    const hasDmInbox = relayTypes.includes('dmInbox');

    const compacted: RelayType[] = [];
    if (hasBoth || (hasRead && hasWrite)) {
        compacted.push('nip65Both');
    } else if (hasRead) {
        compacted.push('nip65Read');
    } else if (hasWrite) {
        compacted.push('nip65Write');
    }

    if (hasDmInbox) {
        compacted.push('dmInbox');
    }

    return compacted;
}

export function SettingsRelaysPage({
    configuredRows,
    suggestedRows,
    connectedConfiguredRelays,
    disconnectedConfiguredRelays,
    relayInfoByUrl,
    configuredRelayConnectionStatusByRelay,
    relayConnectionStatusByRelay,
    relayTypeLabels,
    newRelayInput,
    newRelayType,
    invalidRelayInputs,
    onNewRelayInputChange,
    onNewRelayTypeChange,
    onAddRelays,
    onOpenRelayDetails,
    onRemoveRelay,
    onAddSuggestedRelay,
    onAddAllSuggestedRelays,
    onResetRelaysToDefault,
    onOpenRelayActionsMenu,
    describeRelay,
    relayAvatarFallback,
    relayConnectionBadge,
}: SettingsRelaysPageProps) {
    const summaryBadges = [
        `Relays configurados: ${configuredRows.length}`,
        `Conectados: ${connectedConfiguredRelays}`,
        `Sin conexión: ${disconnectedConfiguredRelays}`,
    ];

    return (
        <>
            <OverlayPageHeader
                title="Relays"
                description="Relays configurados, sugeridos y estado de conexion Nostr."
            />
            <div className="grid min-h-0 gap-2.5 overflow-x-hidden overflow-y-auto pr-px" data-testid="settings-page-body">
                <div className="nostr-relays-content">
                    <p className="nostr-relays-help">Conecta varios relays. Puedes agregar uno por vez y elegir categoria.</p>

                    <div className="nostr-relays-layout">
                        <div className="nostr-relays-main">
                            <div className="nostr-relay-connection-summary" role="status" aria-live="polite">
                                {summaryBadges.map((label) => (
                                    <Badge key={label} variant="outline">
                                        {label}
                                    </Badge>
                                ))}
                            </div>

                            <Card variant="elevated" size="sm" className="nostr-relay-table-wrap gap-0 py-0">
                                <CardHeader className="border-b px-3 py-3">
                                    <CardTitle>Relays configurados</CardTitle>
                                            <CardDescription>Estado actual y categorias activas de tus relays.</CardDescription>
                                </CardHeader>
                                <CardContent className="px-0 py-0">
                                    <Table className="nostr-relay-table">
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Relay</TableHead>
                                                <TableHead>Tipo</TableHead>
                                                <TableHead>Estado</TableHead>
                                                <TableHead className="nostr-relay-actions-head">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {configuredRows.map(({ relayUrl, relayTypes, primaryRelayType }) => {
                                                const details = describeRelay(relayUrl, 'configured');
                                                const info = relayInfoByUrl[relayUrl];
                                                const document = info?.data;
                                                const relayConnectionStatus = configuredRelayConnectionStatusByRelay[relayUrl];
                                                const compactedRelayTypes = compactRelayTypes(relayTypes);
                                                const relayTypeSummary = compactedRelayTypes.map((relayType) => relayTypeLabels[relayType]).join(', ');
                                                const detailRelayType = compactedRelayTypes[0] ?? primaryRelayType;

                                                return (
                                                    <TableRow key={`configured-${relayUrl}`}>
                                                        <TableCell className="nostr-relay-url-cell">
                                                            <div className="nostr-relay-main-cell">
                                                                <Avatar className="size-8">
                                                                    {document?.icon ? <AvatarImage src={document.icon} alt={document.name || details.host} /> : null}
                                                                    <AvatarFallback>{relayAvatarFallback(details, document)}</AvatarFallback>
                                                                </Avatar>
                                                                <div className="min-w-0">
                                                                    <p className="nostr-relay-summary-primary">{document?.name || relayUrl}</p>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="nostr-relay-nip-badges">
                                                                {compactedRelayTypes.map((relayType) => (
                                                                    <Badge key={`configured-type-${relayUrl}-${relayType}`} variant="outline">
                                                                        {relayTypeLabels[relayType]}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {relayConnectionBadge(relayConnectionStatus)}
                                                        </TableCell>
                                                        <TableCell className="nostr-relay-actions-cell">
                                                            <ContextMenu>
                                                                <ContextMenuTrigger asChild>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="icon-sm"
                                                                        aria-label={`Abrir acciones para ${relayUrl} (${relayTypeSummary})`}
                                                                        onClick={onOpenRelayActionsMenu}
                                                                    >
                                                                        <EllipsisVerticalIcon data-icon="inline-start" />
                                                                    </Button>
                                                                </ContextMenuTrigger>
                                                                <ContextMenuContent>
                                                                    <ContextMenuGroup>
                                                                        <ContextMenuItem onSelect={() => onOpenRelayDetails(relayUrl, 'configured', detailRelayType)}>
                                                                            Detalles
                                                                        </ContextMenuItem>
                                                                        <ContextMenuItem variant="destructive" onSelect={() => onRemoveRelay(relayUrl)}>
                                                                            Eliminar
                                                                        </ContextMenuItem>
                                                                    </ContextMenuGroup>
                                                                </ContextMenuContent>
                                                            </ContextMenu>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>

                        <aside className="nostr-relays-sidebar" aria-label="Panel de relays">
                            <Card variant="elevated" size="sm" className="nostr-relays-sidebar-panel gap-0 py-0">
                                <CardHeader className="border-b px-3 py-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <CardTitle className="nostr-relays-sidebar-title">Añadir relay</CardTitle>
                                        <Button type="button" variant="ghost" size="sm" onClick={onResetRelaysToDefault}>
                                            Restablecer por defecto
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="px-3 py-3">
                                    <InputGroup>
                                        <InputGroupInput
                                            aria-label="URLs de relay"
                                            placeholder="wss://relay.example"
                                            value={newRelayInput}
                                            onChange={(event) => onNewRelayInputChange(event.target.value)}
                                        />
                                        <InputGroupAddon align="inline-end">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <InputGroupButton variant="ghost" aria-label="Categoria del relay">
                                                        {relayTypeLabels[newRelayType]}
                                                        <ChevronDownIcon />
                                                    </InputGroupButton>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuGroup>
                                                        {Object.keys(relayTypeLabels).map((relayType) => (
                                                            <DropdownMenuItem
                                                                key={`relay-type-${relayType}`}
                                                                onSelect={() => onNewRelayTypeChange(relayType as RelayType)}
                                                            >
                                                                {relayTypeLabels[relayType as RelayType]}
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuGroup>
                                                </DropdownMenuContent>
                                            </DropdownMenu>

                                            <InputGroupButton
                                                variant="secondary"
                                                onClick={onAddRelays}
                                            >
                                                Añadir
                                            </InputGroupButton>
                                        </InputGroupAddon>
                                    </InputGroup>

                                    {invalidRelayInputs.length > 0 ? (
                                        <p className="nostr-settings-error">
                                            Entradas invalidas: {invalidRelayInputs.join(', ')}
                                        </p>
                                    ) : null}
                                </CardContent>
                            </Card>

                            {suggestedRows.length > 0 ? (
                                <Card variant="elevated" size="sm" className="nostr-relay-suggested nostr-relays-sidebar-panel gap-0 py-0">
                                <CardHeader className="border-b px-3 py-3">
                                    <div className="nostr-relay-suggested-header">
                                            <CardTitle>Relays sugeridos</CardTitle>
                                            <Button type="button" variant="outline" className="nostr-relay-add-suggested" onClick={onAddAllSuggestedRelays}>
                                                Agregar todos
                                            </Button>
                                        </div>
                                        <CardDescription>Relays sugeridos por protocolo (NIP-65 / NIP-17).</CardDescription>
                                    </CardHeader>
                                    <CardContent className="px-0 py-0">
                                        <div className="nostr-relay-table-wrap">
                                            <Table className="nostr-relay-table">
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Relay</TableHead>
                                                        <TableHead>Tipo</TableHead>
                                                        <TableHead>Estado</TableHead>
                                                        <TableHead className="nostr-relay-actions-head">Acciones</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {suggestedRows.map(({ relayUrl, relayTypes, primaryRelayType }) => {
                                                        const details = describeRelay(relayUrl, 'suggested');
                                                        const info = relayInfoByUrl[relayUrl];
                                                        const document = info?.data;
                                                        const relayConnectionStatus = relayConnectionStatusByRelay[relayUrl];
                                                        const compactedRelayTypes = compactRelayTypes(relayTypes);
                                                        const relayTypeSummary = compactedRelayTypes.map((relayType) => relayTypeLabels[relayType]).join(', ');
                                                        const detailRelayType = compactedRelayTypes[0] ?? primaryRelayType;

                                                        return (
                                                            <TableRow key={`suggested-${relayUrl}`}>
                                                                <TableCell className="nostr-relay-url-cell">
                                                                    <div className="nostr-relay-main-cell">
                                                                        <Avatar className="size-8">
                                                                            {document?.icon ? <AvatarImage src={document.icon} alt={document.name || details.host} /> : null}
                                                                            <AvatarFallback>{relayAvatarFallback(details, document)}</AvatarFallback>
                                                                        </Avatar>
                                                                        <div className="min-w-0">
                                                                            <p className="nostr-relay-summary-primary">{document?.name || relayUrl}</p>
                                                                        </div>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className="nostr-relay-nip-badges">
                                                                        {compactedRelayTypes.map((relayType) => (
                                                                            <Badge key={`suggested-type-${relayUrl}-${relayType}`} variant="outline">
                                                                                {relayTypeLabels[relayType]}
                                                                            </Badge>
                                                                        ))}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    {relayConnectionBadge(relayConnectionStatus)}
                                                                </TableCell>
                                                                <TableCell className="nostr-relay-actions-cell">
                                                                    <ContextMenu>
                                                                        <ContextMenuTrigger asChild>
                                                                            <Button
                                                                                type="button"
                                                                                variant="outline"
                                                                                size="icon-sm"
                                                                                aria-label={`Abrir acciones sugeridas para ${relayUrl} (${relayTypeSummary})`}
                                                                                onClick={onOpenRelayActionsMenu}
                                                                            >
                                                                                <EllipsisVerticalIcon data-icon="inline-start" />
                                                                            </Button>
                                                                        </ContextMenuTrigger>
                                                                        <ContextMenuContent>
                                                                            <ContextMenuGroup>
                                                                                <ContextMenuItem onSelect={() => onOpenRelayDetails(relayUrl, 'suggested', detailRelayType)}>
                                                                                    Detalles
                                                                                </ContextMenuItem>
                                                                                <ContextMenuItem onSelect={() => onAddSuggestedRelay(relayUrl, relayTypes)}>
                                                                                    Añadir
                                                                                </ContextMenuItem>
                                                                            </ContextMenuGroup>
                                                                        </ContextMenuContent>
                                                                    </ContextMenu>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : null}
                        </aside>
                    </div>
                </div>
            </div>
        </>
    );
}

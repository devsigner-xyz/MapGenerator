import type { MouseEvent, ReactElement } from 'react';
import type { RelayType } from '../../../nostr/relay-settings';
import type { RelayConnectionStatus } from '../../hooks/useRelayConnectionSummary';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    onRemoveRelay: (relayUrl: string, relayType: RelayType) => void;
    onAddSuggestedRelay: (relayUrl: string, relayType: RelayType) => void;
    onAddAllSuggestedRelays: () => void;
    onOpenRelayActionsMenu: (event: MouseEvent<HTMLButtonElement>) => void;
    describeRelay: (relayUrl: string, source: RelaySource) => RelayDetails;
    relayAvatarFallback: (details: RelayDetails, document?: RelayInformationDocument) => string;
    relayConnectionBadge: (status: RelayConnectionStatus | undefined) => ReactElement;
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
    onOpenRelayActionsMenu,
    describeRelay,
    relayAvatarFallback,
    relayConnectionBadge,
}: SettingsRelaysPageProps) {
    return (
        <>
            <header className="nostr-page-header">
                <h3 className="nostr-page-header-inline-title">Relays</h3>
                <p>Relays configurados, sugeridos y estado de conexion Nostr.</p>
            </header>
            <div className="nostr-page-content nostr-settings-body">
                <div className="nostr-relays-content">
                    <p className="nostr-relays-help">Conecta varios relays. Puedes agregar uno por vez y elegir categoria.</p>

                    <div className="nostr-relays-layout">
                        <div className="nostr-relays-main">
                    <div className="nostr-relay-connection-summary" role="status" aria-live="polite">
                        <p>Relays configurados: {configuredRows.length}</p>
                        <p>Conectados: {connectedConfiguredRelays}</p>
                        <p>Sin conexión: {disconnectedConfiguredRelays}</p>
                    </div>

                    <div className="nostr-relay-table-wrap">
                        <Table className="nostr-relay-table">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Relay</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="nostr-relay-actions-head">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {configuredRows.map(({ relayUrl, relayType }) => {
                                    const details = describeRelay(relayUrl, 'configured');
                                    const info = relayInfoByUrl[relayUrl];
                                    const document = info?.data;
                                    const relayConnectionStatus = configuredRelayConnectionStatusByRelay[relayUrl];

                                    return (
                                        <TableRow key={`configured-${relayType}-${relayUrl}`}>
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
                                                <Badge variant="outline">{relayTypeLabels[relayType]}</Badge>
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
                                                            aria-label={`Abrir acciones para ${relayUrl} (${relayTypeLabels[relayType]})`}
                                                            onClick={onOpenRelayActionsMenu}
                                                        >
                                                            <EllipsisVerticalIcon data-icon="inline-start" />
                                                        </Button>
                                                    </ContextMenuTrigger>
                                                    <ContextMenuContent>
                                                        <ContextMenuGroup>
                                                            <ContextMenuItem onSelect={() => onOpenRelayDetails(relayUrl, 'configured', relayType)}>
                                                                Details
                                                            </ContextMenuItem>
                                                            <ContextMenuItem variant="destructive" onSelect={() => onRemoveRelay(relayUrl, relayType)}>
                                                                Remove
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
                </div>

                        <aside className="nostr-relays-sidebar" aria-label="Panel de relays">
                    <section className="nostr-relays-sidebar-panel">
                        <p className="nostr-relays-sidebar-title">Añadir relay</p>

                        <InputGroup>
                            <InputGroupInput
                                aria-label="Relay URLs"
                                placeholder="wss://relay.example"
                                value={newRelayInput}
                                onChange={(event) => onNewRelayInputChange(event.target.value)}
                            />
                            <InputGroupAddon align="inline-end">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <InputGroupButton variant="ghost" aria-label="Relay category">
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
                    </section>

                    {suggestedRows.length > 0 ? (
                        <section className="nostr-relay-suggested nostr-relays-sidebar-panel">
                            <div className="nostr-relay-suggested-header">
                                <p>Relays sugeridos por protocolo (NIP-65 / NIP-17)</p>
                                <Button type="button" variant="outline" className="nostr-relay-add-suggested" onClick={onAddAllSuggestedRelays}>
                                    Agregar todos
                                </Button>
                            </div>

                            <div className="nostr-relay-table-wrap">
                                <Table className="nostr-relay-table">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Relay</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="nostr-relay-actions-head">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {suggestedRows.map(({ relayUrl, relayType }) => {
                                            const details = describeRelay(relayUrl, 'suggested');
                                            const info = relayInfoByUrl[relayUrl];
                                            const document = info?.data;
                                            const relayConnectionStatus = relayConnectionStatusByRelay[relayUrl];

                                            return (
                                                <TableRow key={`suggested-${relayType}-${relayUrl}`}>
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
                                                        <Badge variant="outline">{relayTypeLabels[relayType]}</Badge>
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
                                                                    aria-label={`Abrir acciones sugeridas para ${relayUrl} (${relayTypeLabels[relayType]})`}
                                                                    onClick={onOpenRelayActionsMenu}
                                                                >
                                                                    <EllipsisVerticalIcon data-icon="inline-start" />
                                                                </Button>
                                                            </ContextMenuTrigger>
                                                            <ContextMenuContent>
                                                                <ContextMenuGroup>
                                                                    <ContextMenuItem onSelect={() => onOpenRelayDetails(relayUrl, 'suggested', relayType)}>
                                                                        Details
                                                                    </ContextMenuItem>
                                                                    <ContextMenuItem onSelect={() => onAddSuggestedRelay(relayUrl, relayType)}>
                                                                        Add
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
                        </section>
                    ) : null}
                        </aside>
                    </div>
                </div>
            </div>
        </>
    );
}

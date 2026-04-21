import type { MouseEvent, ReactElement } from 'react';
import type { RelayType } from '../../../nostr/relay-settings';
import type { RelayConnectionStatus } from '../../hooks/useRelayConnectionSummary';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EllipsisVerticalIcon } from 'lucide-react';
import type { RelayDetails, RelayInformationDocument, RelayRow, RelaySource } from './types';

interface SettingsDmRelaysSectionProps {
    configuredRows: RelayRow[];
    suggestedRows: RelayRow[];
    relayInfoByUrl: Record<string, { data?: RelayInformationDocument }>;
    relayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayTypeLabels: Record<RelayType, string>;
    newRelayInput: string;
    invalidRelayInputs: string[];
    onNewRelayInputChange: (value: string) => void;
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

export function SettingsDmRelaysSection({
    configuredRows,
    suggestedRows,
    relayInfoByUrl,
    relayConnectionStatusByRelay,
    relayTypeLabels,
    newRelayInput,
    invalidRelayInputs,
    onNewRelayInputChange,
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
}: SettingsDmRelaysSectionProps) {
    const relayInputErrorId = 'dm-relay-input-error';
    const hasInvalidRelayInputs = invalidRelayInputs.length > 0;

    return (
        <Card size="sm" className="nostr-relays-panel gap-0 py-0">
            <CardHeader className="border-b px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle>Relays de mensajes</CardTitle>
                    <Button type="button" variant="ghost" size="sm" onClick={onResetRelaysToDefault}>
                        Restablecer por defecto
                    </Button>
                </div>
                <CardDescription>
                    Se usan para recibir mensajes privados.
                    <br />
                    Esta lista corresponde al kind:10050.
                    <br />
                    Si tu perfil publica relays de DM, pueden aparecer como sugeridos.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-3 py-3">
                <InputGroup>
                    <InputGroupInput
                        aria-label="URLs de relay de mensajes"
                        type="url"
                        inputMode="url"
                        name="dmRelayUrls"
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={hasInvalidRelayInputs}
                        aria-describedby={hasInvalidRelayInputs ? relayInputErrorId : undefined}
                        placeholder="wss://relay.dm.example"
                        value={newRelayInput}
                        onChange={(event) => onNewRelayInputChange(event.target.value)}
                    />
                    <InputGroupAddon align="inline-end">
                        <InputGroupButton variant="secondary" onClick={onAddRelays}>
                            Añadir
                        </InputGroupButton>
                    </InputGroupAddon>
                </InputGroup>

                {hasInvalidRelayInputs ? (
                    <p id={relayInputErrorId} role="alert" className="nostr-settings-error">
                        Entradas invalidas: {invalidRelayInputs.join(', ')}
                    </p>
                ) : null}

                <div className="flex flex-col gap-3">
                    <div>
                        <div className="nostr-relay-suggested-header mb-2">
                            <h3 className="text-sm font-semibold">Configurados</h3>
                        </div>
                        <div className="nostr-relay-table-scroll">
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
                                        const document = relayInfoByUrl[relayUrl]?.data;
                                        const relayConnectionStatus = relayConnectionStatusByRelay[relayUrl];

                                        return (
                                            <TableRow key={`dm-configured-${relayUrl}`}>
                                                <TableCell className="nostr-relay-url-cell">
                                                    <div className="nostr-relay-main-cell">
                                                        <Avatar className="size-8">
                                                            <AvatarFallback>{relayAvatarFallback(details, document)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <p className="nostr-relay-summary-primary">{document?.name || relayUrl}</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="nostr-relay-nip-badges">
                                                        {relayTypes.map((relayType) => (
                                                            <Badge key={`dm-configured-type-${relayUrl}-${relayType}`} variant="outline">
                                                                {relayTypeLabels[relayType]}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{relayConnectionBadge(relayConnectionStatus)}</TableCell>
                                                <TableCell className="nostr-relay-actions-cell">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="icon-sm"
                                                                aria-label={`Abrir acciones para ${relayUrl} (${relayTypes.map((relayType) => relayTypeLabels[relayType]).join(', ')})`}
                                                                onClick={onOpenRelayActionsMenu}
                                                            >
                                                                <EllipsisVerticalIcon data-icon="inline-start" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuGroup>
                                                                <DropdownMenuItem onSelect={() => onOpenRelayDetails(relayUrl, 'configured', primaryRelayType)}>
                                                                    Detalles
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem variant="destructive" onSelect={() => onRemoveRelay(relayUrl)}>
                                                                    Eliminar
                                                                </DropdownMenuItem>
                                                            </DropdownMenuGroup>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {suggestedRows.length > 0 ? (
                        <div>
                            <div className="nostr-relay-suggested-header mb-2">
                                <h3 className="text-sm font-semibold">Sugeridos</h3>
                                <Button type="button" variant="outline" className="nostr-relay-add-suggested" onClick={onAddAllSuggestedRelays}>
                                    Agregar todos
                                </Button>
                            </div>
                            <div className="nostr-relay-table-scroll">
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
                                            const document = relayInfoByUrl[relayUrl]?.data;
                                            const relayConnectionStatus = relayConnectionStatusByRelay[relayUrl];

                                            return (
                                                <TableRow key={`dm-suggested-${relayUrl}`}>
                                                    <TableCell className="nostr-relay-url-cell">
                                                        <div className="nostr-relay-main-cell">
                                                            <Avatar className="size-8">
                                                                <AvatarFallback>{relayAvatarFallback(details, document)}</AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0">
                                                                <p className="nostr-relay-summary-primary">{document?.name || relayUrl}</p>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="nostr-relay-nip-badges">
                                                            {relayTypes.map((relayType) => (
                                                                <Badge key={`dm-suggested-type-${relayUrl}-${relayType}`} variant="outline">
                                                                    {relayTypeLabels[relayType]}
                                                                </Badge>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{relayConnectionBadge(relayConnectionStatus)}</TableCell>
                                                    <TableCell className="nostr-relay-actions-cell">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    size="icon-sm"
                                                                    aria-label={`Abrir acciones sugeridas para ${relayUrl} (${relayTypes.map((relayType) => relayTypeLabels[relayType]).join(', ')})`}
                                                                    onClick={onOpenRelayActionsMenu}
                                                                >
                                                                    <EllipsisVerticalIcon data-icon="inline-start" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuGroup>
                                                                    <DropdownMenuItem onSelect={() => onOpenRelayDetails(relayUrl, 'suggested', primaryRelayType)}>
                                                                        Detalles
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onSelect={() => onAddSuggestedRelay(relayUrl, relayTypes)}>
                                                                        Añadir
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuGroup>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    );
}

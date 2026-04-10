import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { EllipsisVerticalIcon } from 'lucide-react';
import { addRelay, loadRelaySettings, removeRelay, saveRelaySettings, type RelaySettingsState } from '../../nostr/relay-settings';
import { normalizeRelayUrl } from '../../nostr/relay-policy';
import { loadUiSettings, saveUiSettings, type UiSettingsState } from '../../nostr/ui-settings';
import {
    addZapAmount,
    loadZapSettings,
    removeZapAmount,
    saveZapSettings,
    updateZapAmount,
    type ZapSettingsState,
} from '../../nostr/zap-settings';
import type { MapBridge } from '../map-bridge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface MapSettingsModalProps {
    mapBridge: MapBridge | null;
    suggestedRelays?: string[];
    onUiSettingsChange?: (nextState: UiSettingsState) => void;
    zapSettings?: ZapSettingsState;
    onZapSettingsChange?: (nextState: ZapSettingsState) => void;
    initialView?: SettingsView;
    onClose: () => void;
}

const EMPTY_RELAYS: string[] = [];

export type SettingsView = 'advanced' | 'ui' | 'shortcuts' | 'relays' | 'relay-detail' | 'about' | 'zaps';

type RelaySource = 'configured' | 'suggested';

interface RelayDetails {
    relayUrl: string;
    source: RelaySource;
    host: string;
    protocol: string;
    path: string;
    port: string;
    secure: boolean;
}

interface RelayFee {
    amount?: number;
    unit?: string;
    period?: number;
    kinds?: number[];
}

interface RelayInformationDocument {
    name?: string;
    description?: string;
    icon?: string;
    pubkey?: string;
    contact?: string;
    supported_nips?: number[];
    software?: string;
    version?: string;
    terms_of_service?: string;
    payments_url?: string;
    limitation?: {
        payment_required?: boolean;
        auth_required?: boolean;
        restricted_writes?: boolean;
        max_limit?: number;
        default_limit?: number;
        max_subscriptions?: number;
    };
    fees?: {
        admission?: RelayFee[];
        subscription?: RelayFee[];
        publication?: RelayFee[];
    };
}

interface RelayInfoState {
    status: 'loading' | 'ready' | 'error';
    data?: RelayInformationDocument;
}

interface RelaySelection {
    relayUrl: string;
    source: RelaySource;
}

function describeRelay(relayUrl: string, source: RelaySource): RelayDetails {
    try {
        const parsed = new URL(relayUrl);
        return {
            relayUrl,
            source,
            host: parsed.hostname || 'unknown',
            protocol: parsed.protocol.replace(':', ''),
            path: parsed.pathname || '/',
            port: parsed.port || (parsed.protocol === 'wss:' ? '443' : parsed.protocol === 'ws:' ? '80' : 'unknown'),
            secure: parsed.protocol === 'wss:',
        };
    } catch {
        return {
            relayUrl,
            source,
            host: 'unknown',
            protocol: relayUrl.startsWith('wss://') ? 'wss' : relayUrl.startsWith('ws://') ? 'ws' : 'unknown',
            path: '/',
            port: 'unknown',
            secure: relayUrl.startsWith('wss://'),
        };
    }
}

function relayHttpEndpoint(relayUrl: string): string | null {
    try {
        const parsed = new URL(relayUrl);
        if (parsed.protocol === 'wss:') {
            parsed.protocol = 'https:';
        } else if (parsed.protocol === 'ws:') {
            parsed.protocol = 'http:';
        } else {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
}

async function fetchRelayInformation(relayUrl: string): Promise<RelayInformationDocument> {
    const endpoint = relayHttpEndpoint(relayUrl);
    if (!endpoint) {
        throw new Error('invalid relay endpoint');
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
        controller.abort();
    }, 3500);

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                Accept: 'application/nostr+json, application/json;q=0.9',
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`status ${response.status}`);
        }

        const payload = await response.json() as unknown;
        if (!payload || typeof payload !== 'object') {
            throw new Error('invalid payload');
        }

        return payload as RelayInformationDocument;
    } finally {
        window.clearTimeout(timeout);
    }
}

function relayRequiresPayment(document?: RelayInformationDocument): boolean | null {
    if (!document) {
        return null;
    }

    if (typeof document.limitation?.payment_required === 'boolean') {
        return document.limitation.payment_required;
    }

    const hasFees = Boolean(
        (document.fees?.admission && document.fees.admission.length > 0)
        || (document.fees?.subscription && document.fees.subscription.length > 0)
        || (document.fees?.publication && document.fees.publication.length > 0)
    );
    return hasFees ? true : null;
}

function relayAvatarFallback(details: RelayDetails, document?: RelayInformationDocument): string {
    const source = document?.name || details.host || details.relayUrl;
    const parts = source.split(/[^a-zA-Z0-9]+/).filter((part) => part.length > 0);
    if (parts.length >= 2) {
        return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
}

function formatRelayFee(fee: RelayFee): string {
    const amount = typeof fee.amount === 'number' ? `${fee.amount} ${fee.unit || ''}`.trim() : 'unknown amount';
    if (typeof fee.period === 'number') {
        return `${amount} / ${fee.period}s`;
    }
    if (Array.isArray(fee.kinds) && fee.kinds.length > 0) {
        return `${amount} (kinds ${fee.kinds.join(', ')})`;
    }
    return amount;
}

function normalizeRelayInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
        return normalizeRelayUrl(trimmed);
    }

    return normalizeRelayUrl(`wss://${trimmed}`);
}

export function MapSettingsModal({
    mapBridge,
    suggestedRelays = EMPTY_RELAYS,
    onUiSettingsChange,
    zapSettings,
    onZapSettingsChange,
    initialView = 'ui',
    onClose,
}: MapSettingsModalProps) {
    const [view, setView] = useState<SettingsView>(initialView);
    const [relaySettings, setRelaySettings] = useState<RelaySettingsState>(() => loadRelaySettings());
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [zapSettingsState, setZapSettingsState] = useState<ZapSettingsState>(() => zapSettings ?? loadZapSettings());
    const [newRelayInput, setNewRelayInput] = useState('');
    const [newZapAmountInput, setNewZapAmountInput] = useState('');
    const [invalidRelayInputs, setInvalidRelayInputs] = useState<string[]>([]);
    const [selectedRelay, setSelectedRelay] = useState<RelaySelection | null>(null);
    const [relayInfoByUrl, setRelayInfoByUrl] = useState<Record<string, RelayInfoState>>({});
    const settingsHostRef = useRef<HTMLDivElement | null>(null);

    const persistRelaySettings = (nextState: RelaySettingsState): void => {
        const savedState = saveRelaySettings(nextState);
        setRelaySettings(savedState);
    };

    const persistUiSettings = (nextState: UiSettingsState): void => {
        const savedState = saveUiSettings(nextState);
        setUiSettings(savedState);
        onUiSettingsChange?.(savedState);
    };

    const persistZapSettings = (nextState: ZapSettingsState): void => {
        const savedState = saveZapSettings(nextState);
        setZapSettingsState(savedState);
        onZapSettingsChange?.(savedState);
    };

    const handleAddRelays = (): void => {
        const lines = newRelayInput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            setInvalidRelayInputs([]);
            return;
        }

        let nextState = relaySettings;
        const invalid: string[] = [];

        for (const line of lines) {
            const normalized = normalizeRelayInput(line);
            if (!normalized) {
                invalid.push(line);
                continue;
            }

            nextState = addRelay(nextState, normalized);
        }

        persistRelaySettings(nextState);
        setInvalidRelayInputs(invalid);
        setNewRelayInput('');
    };

    const handleRemoveRelay = (relayUrl: string): void => {
        const nextState = removeRelay(relaySettings, relayUrl);
        persistRelaySettings(nextState);
    };

    const handleAddSuggestedRelay = (relayUrl: string): void => {
        const nextState = addRelay(relaySettings, relayUrl);
        persistRelaySettings(nextState);
    };

    const handleAddAllSuggestedRelays = (): void => {
        let nextState = relaySettings;
        for (const relayUrl of suggestedRelays) {
            nextState = addRelay(nextState, relayUrl);
        }
        persistRelaySettings(nextState);
    };

    const suggestedNotAdded = suggestedRelays.filter((relayUrl) => !relaySettings.relays.includes(relayUrl));

    const relayInfoTargets = useMemo(() => {
        return [...new Set([...relaySettings.relays, ...suggestedRelays])];
    }, [relaySettings.relays, suggestedRelays]);

    const openRelayDetails = (relayUrl: string, source: RelaySource): void => {
        setSelectedRelay({ relayUrl, source });
        setView('relay-detail');
    };

    const openRelayActionsMenu = (event: MouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    };

    useEffect(() => {
        if (!zapSettings) {
            return;
        }

        setZapSettingsState(zapSettings);
    }, [zapSettings]);

    useEffect(() => {
        if (!mapBridge || view !== 'advanced' || !settingsHostRef.current) {
            return;
        }

        mapBridge.mountSettingsPanel(settingsHostRef.current);
        return () => {
            mapBridge.mountSettingsPanel(null);
        };
    }, [mapBridge, view]);

    useEffect(() => {
        if (view !== 'relays' || relayInfoTargets.length === 0 || typeof fetch !== 'function') {
            return;
        }

        const pending: string[] = [];
        setRelayInfoByUrl((current) => {
            let changed = false;
            const next = { ...current };
            for (const relayUrl of relayInfoTargets) {
                if (!next[relayUrl]) {
                    next[relayUrl] = { status: 'loading' };
                    pending.push(relayUrl);
                    changed = true;
                }
            }
            return changed ? next : current;
        });

        if (pending.length === 0) {
            return;
        }

        let cancelled = false;
        void Promise.all(pending.map(async (relayUrl) => {
            try {
                const data = await fetchRelayInformation(relayUrl);
                if (cancelled) {
                    return;
                }

                setRelayInfoByUrl((current) => ({
                    ...current,
                    [relayUrl]: {
                        status: 'ready',
                        data,
                    },
                }));
            } catch {
                if (cancelled) {
                    return;
                }

                setRelayInfoByUrl((current) => ({
                    ...current,
                    [relayUrl]: {
                        status: 'error',
                    },
                }));
            }
        }));

        return () => {
            cancelled = true;
        };
    }, [view, relayInfoTargets]);

    const selectedRelayDetails = selectedRelay ? describeRelay(selectedRelay.relayUrl, selectedRelay.source) : null;
    const selectedRelayInfo = selectedRelay ? relayInfoByUrl[selectedRelay.relayUrl] : undefined;
    const canGoBack = view === 'relay-detail';

    return (
        <Dialog open onOpenChange={(open) => {
            if (!open) {
                onClose();
            }
        }}>
            <DialogContent className={`nostr-settings-modal${view === 'relays' || view === 'relay-detail' ? ' nostr-settings-modal-relays' : ''}`} aria-label="Ajustes">
                <DialogTitle className="sr-only">Ajustes</DialogTitle>
                <DialogDescription className="sr-only">Configuracion del overlay del mapa.</DialogDescription>
                <div className="nostr-settings-header">
                    <p className="nostr-settings-title">
                        {view === 'advanced'
                                ? 'Advanced settings'
                            : view === 'ui'
                                ? 'UI'
                                : view === 'shortcuts'
                                    ? 'Shortcuts'
                                    : view === 'relays'
                                        ? 'Relays'
                                        : view === 'relay-detail'
                                            ? 'Relay details'
                                        : view === 'zaps'
                                            ? 'Zaps'
                                            : 'About'}
                    </p>

                </div>

                <div className="nostr-settings-body">
                    {view === 'advanced' ? (
                    <div className="nostr-shortcuts-content">
                        <p>Configuracion avanzada del MapGenerator.</p>
                        <div ref={settingsHostRef} className="nostr-settings-host" />
                    </div>
                ) : view === 'ui' ? (
                    <div className="nostr-shortcuts-content">
                        <p>Configura el zoom minimo para mostrar avatar y nombre en edificios ocupados.</p>
                        <div className="nostr-ui-slider-row">
                            <Label className="nostr-label" htmlFor="nostr-occupied-zoom-level">Occupied labels zoom level</Label>
                            <span className="nostr-ui-slider-value">{uiSettings.occupiedLabelsZoomLevel}</span>
                        </div>
                        <input
                            id="nostr-occupied-zoom-level"
                            className="nostr-input"
                            type="range"
                            aria-label="Occupied labels zoom level"
                            min={1}
                            max={20}
                            step={1}
                            value={uiSettings.occupiedLabelsZoomLevel}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (!Number.isFinite(nextValue)) {
                                    return;
                                }
                                persistUiSettings({
                                    ...uiSettings,
                                    occupiedLabelsZoomLevel: nextValue,
                                });
                            }}
                        />
                        <div className="nostr-ui-slider-marks" aria-hidden="true">
                            <span>1</span>
                            <span>8</span>
                            <span>20</span>
                        </div>

                        <Separator className="nostr-divider" />

                        <div className="nostr-ui-toggle-row">
                            <Label className="nostr-label" htmlFor="nostr-street-labels-enabled">Street labels</Label>
                            <Switch
                                id="nostr-street-labels-enabled"
                                size="sm"
                                aria-label="Street labels enabled"
                                checked={uiSettings.streetLabelsEnabled}
                                onCheckedChange={(checked) => {
                                    persistUiSettings({
                                        ...uiSettings,
                                        streetLabelsEnabled: checked,
                                    });
                                }}
                            />
                        </div>

                        <div className="nostr-ui-toggle-row">
                            <Label className="nostr-label" htmlFor="nostr-verified-buildings-overlay-enabled">Verified buildings overlay</Label>
                            <Switch
                                id="nostr-verified-buildings-overlay-enabled"
                                size="sm"
                                aria-label="Verified buildings overlay enabled"
                                checked={uiSettings.verifiedBuildingsOverlayEnabled}
                                onCheckedChange={(checked) => {
                                    persistUiSettings({
                                        ...uiSettings,
                                        verifiedBuildingsOverlayEnabled: checked,
                                    });
                                }}
                            />
                        </div>

                        <div className="nostr-ui-slider-row">
                            <Label className="nostr-label" htmlFor="nostr-street-zoom-level">Street labels zoom level</Label>
                            <span className="nostr-ui-slider-value">{uiSettings.streetLabelsZoomLevel}</span>
                        </div>
                        <input
                            id="nostr-street-zoom-level"
                            className="nostr-input"
                            type="range"
                            aria-label="Street labels zoom level"
                            min={1}
                            max={20}
                            step={1}
                            disabled={!uiSettings.streetLabelsEnabled}
                            value={uiSettings.streetLabelsZoomLevel}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (!Number.isFinite(nextValue)) {
                                    return;
                                }
                                persistUiSettings({
                                    ...uiSettings,
                                    streetLabelsZoomLevel: nextValue,
                                });
                            }}
                        />

                        <hr className="nostr-divider" />

                        <div className="nostr-ui-slider-row">
                            <label className="nostr-label" htmlFor="nostr-traffic-count">Cars in city</label>
                            <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesCount}</span>
                        </div>
                        <input
                            id="nostr-traffic-count"
                            className="nostr-input"
                            type="range"
                            min={0}
                            max={50}
                            step={1}
                            aria-label="Cars in city"
                            value={uiSettings.trafficParticlesCount}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (!Number.isFinite(nextValue)) {
                                    return;
                                }

                                persistUiSettings({
                                    ...uiSettings,
                                    trafficParticlesCount: nextValue,
                                });
                            }}
                        />

                        <div className="nostr-ui-slider-row">
                            <label className="nostr-label" htmlFor="nostr-traffic-speed">Cars speed</label>
                            <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesSpeed.toFixed(1)}x</span>
                        </div>
                        <input
                            id="nostr-traffic-speed"
                            className="nostr-input"
                            type="range"
                            min={0.2}
                            max={3}
                            step={0.1}
                            aria-label="Cars speed"
                            value={uiSettings.trafficParticlesSpeed}
                            onChange={(event) => {
                                const nextValue = Number(event.target.value);
                                if (!Number.isFinite(nextValue)) {
                                    return;
                                }

                                persistUiSettings({
                                    ...uiSettings,
                                    trafficParticlesSpeed: nextValue,
                                });
                            }}
                        />
                    </div>
                ) : view === 'relays' ? (
                    <div className="nostr-relays-content">
                        <p className="nostr-relays-help">Conecta varios relays. Puedes agregar uno por linea.</p>

                        <div className="nostr-relay-table-wrap">
                            <Table className="nostr-relay-table">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Relay</TableHead>
                                        <TableHead className="nostr-relay-actions-head">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {relaySettings.relays.map((relayUrl) => {
                                        const details = describeRelay(relayUrl, 'configured');
                                        const info = relayInfoByUrl[relayUrl];
                                        const document = info?.data;

                                        return (
                                            <TableRow key={relayUrl}>
                                                <TableCell className="nostr-relay-url-cell">
                                                    <div className="nostr-relay-main-cell">
                                                        <Avatar className="size-8">
                                                            {document?.icon ? <AvatarImage src={document.icon} alt={document.name || details.host} /> : null}
                                                            <AvatarFallback>{relayAvatarFallback(details, document)}</AvatarFallback>
                                                        </Avatar>
                                                        <div className="min-w-0">
                                                            <p className="nostr-relay-summary-primary">{document?.name || relayUrl}</p>
                                                            <p className="nostr-relay-summary-sub">Configured relay</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="nostr-relay-actions-cell">
                                                    <ContextMenu>
                                                        <ContextMenuTrigger asChild>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="icon-sm"
                                                                aria-label={`Abrir acciones para ${relayUrl}`}
                                                                onClick={openRelayActionsMenu}
                                                            >
                                                                <EllipsisVerticalIcon data-icon="inline-start" />
                                                            </Button>
                                                        </ContextMenuTrigger>
                                                        <ContextMenuContent>
                                                            <ContextMenuGroup>
                                                                <ContextMenuItem onSelect={() => openRelayDetails(relayUrl, 'configured')}>
                                                                    Details
                                                                </ContextMenuItem>
                                                                <ContextMenuItem variant="destructive" onSelect={() => handleRemoveRelay(relayUrl)}>
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

                        <Textarea
                            className="nostr-input nostr-relay-editor"
                            placeholder="wss://relay.example\nwss://nos.lol"
                            rows={4}
                            value={newRelayInput}
                            onChange={(event) => setNewRelayInput(event.target.value)}
                        />

                        <Button type="button" className="nostr-submit nostr-relay-add" onClick={handleAddRelays}>
                            Add relays
                        </Button>

                        {invalidRelayInputs.length > 0 ? (
                            <p className="nostr-settings-error">
                                Entradas invalidas: {invalidRelayInputs.join(', ')}
                            </p>
                        ) : null}

                        {suggestedRelays.length > 0 ? (
                            <section className="nostr-relay-suggested">
                                <div className="nostr-relay-suggested-header">
                                    <p>Relays sugeridos (NIP-65)</p>
                                    {suggestedNotAdded.length > 0 ? (
                                        <Button type="button" variant="outline" className="nostr-relay-add-suggested" onClick={handleAddAllSuggestedRelays}>
                                            Agregar todos
                                        </Button>
                                    ) : null}
                                </div>

                                {suggestedNotAdded.length > 0 ? (
                                    <div className="nostr-relay-table-wrap">
                                        <Table className="nostr-relay-table">
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Relay</TableHead>
                                                    <TableHead className="nostr-relay-actions-head">Actions</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {suggestedNotAdded.map((relayUrl) => {
                                                    const details = describeRelay(relayUrl, 'suggested');
                                                    const info = relayInfoByUrl[relayUrl];
                                                    const document = info?.data;

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
                                                                        <p className="nostr-relay-summary-sub">Suggested by NIP-65</p>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="nostr-relay-actions-cell">
                                                                <ContextMenu>
                                                                    <ContextMenuTrigger asChild>
                                                                        <Button
                                                                            type="button"
                                                                            variant="outline"
                                                                            size="icon-sm"
                                                                            aria-label={`Abrir acciones sugeridas para ${relayUrl}`}
                                                                            onClick={openRelayActionsMenu}
                                                                        >
                                                                            <EllipsisVerticalIcon data-icon="inline-start" />
                                                                        </Button>
                                                                    </ContextMenuTrigger>
                                                                    <ContextMenuContent>
                                                                        <ContextMenuGroup>
                                                                            <ContextMenuItem onSelect={() => openRelayDetails(relayUrl, 'suggested')}>
                                                                                Details
                                                                            </ContextMenuItem>
                                                                            <ContextMenuItem onSelect={() => handleAddSuggestedRelay(relayUrl)}>
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
                                ) : (
                                    <p className="nostr-relays-help">Todos los relays sugeridos ya estan agregados.</p>
                                )}
                            </section>
                        ) : (
                            <p className="nostr-relays-help">No hay relays sugeridos todavia. Carga una npub para intentar descubrirlos via NIP-65.</p>
                        )}
                    </div>
                ) : view === 'relay-detail' && selectedRelayDetails ? (
                    <div className="nostr-relays-content">
                        {selectedRelayInfo?.status === 'loading' ? (
                            <p className="nostr-relay-meta-loading"><Spinner className="size-3" /> Cargando metadata NIP-11...</p>
                        ) : null}

                        {selectedRelayInfo?.status === 'error' ? (
                            <p className="nostr-relay-meta-loading">No se pudo obtener metadata remota del relay.</p>
                        ) : null}

                        <div className="nostr-relay-detail-header">
                            <Avatar className="size-10">
                                {selectedRelayInfo?.data?.icon ? <AvatarImage src={selectedRelayInfo.data.icon} alt={selectedRelayInfo.data.name || selectedRelayDetails.host} /> : null}
                                <AvatarFallback>{relayAvatarFallback(selectedRelayDetails, selectedRelayInfo?.data)}</AvatarFallback>
                            </Avatar>

                            <div className="min-w-0">
                                <p className="nostr-relay-summary-primary">{selectedRelayInfo?.data?.name || selectedRelayDetails.relayUrl}</p>
                                <p className="nostr-relay-summary-sub">{selectedRelayDetails.source === 'configured' ? 'Configured relay' : 'Suggested by NIP-65'}</p>
                            </div>
                        </div>

                        {selectedRelayInfo?.data?.description ? (
                            <p className="nostr-relay-detail-description">{selectedRelayInfo.data.description}</p>
                        ) : null}

                        <div className="nostr-relay-detail-table-wrap">
                            <Table className="nostr-relay-detail-table">
                                <TableBody>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">URL</TableHead>
                                        <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.relayUrl}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Source</TableHead>
                                        <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.source === 'configured' ? 'Configured' : 'Suggested (NIP-65)'}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Host</TableHead>
                                        <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.host}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Protocol</TableHead>
                                        <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.protocol.toUpperCase()}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Port</TableHead>
                                        <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.port}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Path</TableHead>
                                        <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.path}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Transport</TableHead>
                                        <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.secure ? 'Secure WebSocket (WSS)' : 'WebSocket (WS)'}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Billing</TableHead>
                                        <TableCell className="nostr-relay-detail-value">
                                            {relayRequiresPayment(selectedRelayInfo?.data) === true
                                                ? 'Paid relay'
                                                : relayRequiresPayment(selectedRelayInfo?.data) === false
                                                    ? 'No payment required'
                                                    : 'Unknown'}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">NIP support</TableHead>
                                        <TableCell className="nostr-relay-detail-value">
                                            {typeof selectedRelayInfo?.data?.supported_nips?.length === 'number'
                                                ? `${selectedRelayInfo.data.supported_nips.length} NIPs`
                                                : 'Unknown'}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Event limit</TableHead>
                                        <TableCell className="nostr-relay-detail-value">
                                            {selectedRelayInfo?.data?.limitation?.max_limit
                                                ?? selectedRelayInfo?.data?.limitation?.default_limit
                                                ?? 'Unknown'}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Writes</TableHead>
                                        <TableCell className="nostr-relay-detail-value">{selectedRelayInfo?.data?.limitation?.restricted_writes ? 'Restricted' : 'Open/Unknown'}</TableCell>
                                    </TableRow>
                                    {selectedRelayInfo?.data?.payments_url ? (
                                        <TableRow>
                                            <TableHead className="nostr-relay-detail-key">Payments URL</TableHead>
                                            <TableCell className="nostr-relay-detail-value">{selectedRelayInfo.data.payments_url}</TableCell>
                                        </TableRow>
                                    ) : null}
                                    {selectedRelayInfo?.data?.software ? (
                                        <TableRow>
                                            <TableHead className="nostr-relay-detail-key">Software</TableHead>
                                            <TableCell className="nostr-relay-detail-value">{selectedRelayInfo.data.version ? `${selectedRelayInfo.data.software} (${selectedRelayInfo.data.version})` : selectedRelayInfo.data.software}</TableCell>
                                        </TableRow>
                                    ) : null}
                                    {selectedRelayInfo?.data?.contact ? (
                                        <TableRow>
                                            <TableHead className="nostr-relay-detail-key">Contact</TableHead>
                                            <TableCell className="nostr-relay-detail-value">{selectedRelayInfo.data.contact}</TableCell>
                                        </TableRow>
                                    ) : null}
                                    {selectedRelayInfo?.data?.fees ? (
                                        <TableRow>
                                            <TableHead className="nostr-relay-detail-key">Fees</TableHead>
                                            <TableCell className="nostr-relay-detail-value">
                                                <div className="nostr-relay-detail-inline-list">
                                                    {selectedRelayInfo.data.fees.admission?.map((fee, index) => (
                                                        <span key={`admission-${index}`}>Admission: {formatRelayFee(fee)}</span>
                                                    ))}
                                                    {selectedRelayInfo.data.fees.subscription?.map((fee, index) => (
                                                        <span key={`subscription-${index}`}>Subscription: {formatRelayFee(fee)}</span>
                                                    ))}
                                                    {selectedRelayInfo.data.fees.publication?.map((fee, index) => (
                                                        <span key={`publication-${index}`}>Publication: {formatRelayFee(fee)}</span>
                                                    ))}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                    {selectedRelayInfo?.data?.supported_nips && selectedRelayInfo.data.supported_nips.length > 0 ? (
                                        <TableRow>
                                            <TableHead className="nostr-relay-detail-key">Supported NIPs</TableHead>
                                            <TableCell className="nostr-relay-detail-value">
                                                <div className="nostr-relay-nip-badges">
                                                    {selectedRelayInfo.data.supported_nips.slice(0, 24).map((nip) => (
                                                        <Badge key={`nip-${nip}`} variant="outline">NIP-{nip}</Badge>
                                                    ))}
                                                    {selectedRelayInfo.data.supported_nips.length > 24 ? (
                                                        <Badge variant="secondary">+{selectedRelayInfo.data.supported_nips.length - 24}</Badge>
                                                    ) : null}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                ) : view === 'about' ? (
                    <div className="nostr-shortcuts-content">
                        <div className="nostr-about-section">
                            <h4>NIPs soportadas</h4>
                            <ul>
                                <li>NIP-19 (npub)</li>
                                <li>NIP-65 (relays sugeridos)</li>
                                <li>Kind 0 (metadata de perfil)</li>
                                <li>Kind 1 (publicaciones)</li>
                                <li>Kind 3 (follows/followers)</li>
                            </ul>
                        </div>

                        <div className="nostr-about-section">
                            <h4>Caracteristicas</h4>
                            <ul>
                                <li>Overlay social sobre el mapa</li>
                                <li>Foco de ocupantes y perfil detallado</li>
                                <li>Carga progresiva de red y publicaciones</li>
                                <li>Configuracion de relays desde ajustes</li>
                                <li>Estadisticas de ciudad en tiempo real</li>
                            </ul>
                        </div>
                    </div>
                ) : view === 'zaps' ? (
                    <div className="nostr-shortcuts-content">
                        <p>Cantidad de zaps</p>

                        <div className="nostr-zap-list">
                            {zapSettingsState.amounts.map((amount, index) => (
                                <div key={`zap-${index}-${amount}`} className="nostr-zap-item">
                                    <span>{amount} sats</span>
                                    <div className="nostr-zap-item-actions">
                                        <Input
                                            type="number"
                                            min={1}
                                            step={1}
                                            className="nostr-input"
                                            aria-label={`Cantidad zap ${index + 1}`}
                                            value={String(amount)}
                                            onChange={(event) => {
                                                const nextValue = Number(event.target.value);
                                                if (!Number.isFinite(nextValue)) {
                                                    return;
                                                }
                                                persistZapSettings(updateZapAmount(zapSettingsState, index, nextValue));
                                            }}
                                        />

                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => persistZapSettings(removeZapAmount(zapSettingsState, index))}
                                        >
                                            Quitar
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="nostr-zap-add-row">
                            <Input
                                type="number"
                                min={1}
                                step={1}
                                className="nostr-input"
                                aria-label="Nueva cantidad de zap"
                                placeholder="512"
                                value={newZapAmountInput}
                                onChange={(event) => setNewZapAmountInput(event.target.value)}
                            />
                            <Button
                                type="button"
                                className="nostr-submit"
                                onClick={() => {
                                    const nextValue = Number(newZapAmountInput.trim());
                                    if (!Number.isFinite(nextValue)) {
                                        return;
                                    }
                                    persistZapSettings(addZapAmount(zapSettingsState, nextValue));
                                    setNewZapAmountInput('');
                                }}
                            >
                                Agregar cantidad
                            </Button>
                        </div>
                    </div>
                    ) : (
                    <div className="nostr-shortcuts-content">
                        <p>Mantener pulsada la barra espaciadora y arrastrar para desplazarte por el mapa.</p>
                        <p>Mantener pulsado el wheel del raton y mover el raton para desplazarte por el mapa.</p>
                    </div>
                    )}
                </div>

                {canGoBack ? (
                    <DialogFooter className="sm:justify-between">
                        <Button type="button" variant="outline" onClick={() => setView('relays')}>
                            Volver
                        </Button>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">Cerrar</Button>
                        </DialogClose>
                    </DialogFooter>
                ) : (
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">Cerrar</Button>
                        </DialogClose>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}

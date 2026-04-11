import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement } from 'react';
import { ChevronDownIcon, EllipsisVerticalIcon } from 'lucide-react';
import {
    addRelay,
    getRelaySetByType,
    loadRelaySettings,
    removeRelay,
    RELAY_TYPES,
    saveRelaySettings,
    type RelaySettingsByType,
    type RelaySettingsState,
    type RelayType,
} from '../../nostr/relay-settings';
import { mergeRelaySets, normalizeRelayUrl } from '../../nostr/relay-policy';
import { loadUiSettings, saveUiSettings, type UiSettingsState } from '../../nostr/ui-settings';
import {
    addZapAmount,
    loadZapSettings,
    removeZapAmount,
    saveZapSettings,
    updateZapAmount,
    type ZapSettingsState,
} from '../../nostr/zap-settings';
import {
    useRelayConnectionSummary,
    type RelayConnectionProbe,
    type RelayConnectionStatus,
} from '../hooks/useRelayConnectionSummary';
import type { MapBridge } from '../map-bridge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface MapSettingsDialogProps {
    mapBridge: MapBridge | null;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
    onUiSettingsChange?: (nextState: UiSettingsState) => void;
    zapSettings?: ZapSettingsState;
    onZapSettingsChange?: (nextState: ZapSettingsState) => void;
    initialView?: SettingsView;
    onClose: () => void;
}

const EMPTY_RELAYS: string[] = [];
const EMPTY_RELAYS_BY_TYPE: RelaySettingsByType = {
    nip65Both: [],
    nip65Read: [],
    nip65Write: [],
    dmInbox: [],
};

const RELAY_TYPE_LABELS: Record<RelayType, string> = {
    nip65Both: 'NIP-65 read+write',
    nip65Read: 'NIP-65 read',
    nip65Write: 'NIP-65 write',
    dmInbox: 'NIP-17 DM inbox',
};

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
    relayType: RelayType;
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

function relayConnectionBadge(status: RelayConnectionStatus | undefined): ReactElement {
    if (status === 'connected') {
        return <Badge>Conectado</Badge>;
    }

    if (status === 'disconnected') {
        return <Badge variant="destructive">Sin conexión</Badge>;
    }

    return (
        <Badge variant="secondary">
            <Spinner data-icon="inline-start" />
            Comprobando
        </Badge>
    );
}

function normalizeRelayInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const candidate = trimmed.startsWith('ws://') || trimmed.startsWith('wss://')
        ? trimmed
        : `wss://${trimmed}`;
    const normalized = normalizeRelayUrl(candidate);
    if (!normalized) {
        return null;
    }

    try {
        const parsed = new URL(normalized);
        const host = parsed.hostname.toLowerCase();
        if (!host || host.length > 253) {
            return null;
        }

        const isIpv4 = /^\d+\.\d+\.\d+\.\d+$/.test(host)
            && host.split('.').every((segment) => {
                const value = Number(segment);
                return Number.isInteger(value) && value >= 0 && value <= 255;
            });
        const isIpv6 = host.includes(':') && /^[0-9a-f:]+$/i.test(host);
        const isLocalhost = host === 'localhost';
        const isDomain = host.includes('.')
            && host.split('.').every((label) => /^[a-z0-9-]+$/i.test(label) && !label.startsWith('-') && !label.endsWith('-'));

        if (!isIpv4 && !isIpv6 && !isLocalhost && !isDomain) {
            return null;
        }

        return normalized;
    } catch {
        return null;
    }
}

export function MapSettingsDialog({
    mapBridge,
    suggestedRelays = EMPTY_RELAYS,
    suggestedRelaysByType,
    relayConnectionProbe,
    relayConnectionRefreshIntervalMs,
    onUiSettingsChange,
    zapSettings,
    onZapSettingsChange,
    initialView = 'ui',
    onClose,
}: MapSettingsDialogProps) {
    const [view, setView] = useState<SettingsView>(initialView);
    const [relaySettings, setRelaySettings] = useState<RelaySettingsState>(() => loadRelaySettings());
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [zapSettingsState, setZapSettingsState] = useState<ZapSettingsState>(() => zapSettings ?? loadZapSettings());
    const [newRelayInput, setNewRelayInput] = useState('');
    const [newRelayType, setNewRelayType] = useState<RelayType>('nip65Both');
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

    const normalizedSuggestedByType = useMemo<RelaySettingsByType>(() => {
        const byTypeFromProps: RelaySettingsByType = {
            nip65Both: mergeRelaySets(suggestedRelaysByType?.nip65Both ?? [], suggestedRelays),
            nip65Read: mergeRelaySets(suggestedRelaysByType?.nip65Read ?? []),
            nip65Write: mergeRelaySets(suggestedRelaysByType?.nip65Write ?? []),
            dmInbox: mergeRelaySets(suggestedRelaysByType?.dmInbox ?? []),
        };

        return byTypeFromProps;
    }, [suggestedRelaysByType, suggestedRelays]);

    const configuredRows = useMemo(() => {
        return RELAY_TYPES.flatMap((relayType) =>
            getRelaySetByType(relaySettings, relayType).map((relayUrl) => ({
                relayType,
                relayUrl,
            }))
        );
    }, [relaySettings]);

    const suggestedRows = useMemo(() => {
        return RELAY_TYPES.flatMap((relayType) =>
            normalizedSuggestedByType[relayType]
                .filter((relayUrl) => !getRelaySetByType(relaySettings, relayType).includes(relayUrl))
                .map((relayUrl) => ({
                    relayType,
                    relayUrl,
                }))
        );
    }, [normalizedSuggestedByType, relaySettings]);

    const hasSuggestedRelays = useMemo(() => {
        return RELAY_TYPES.some((relayType) => normalizedSuggestedByType[relayType].length > 0);
    }, [normalizedSuggestedByType]);

    const configuredRelayStatusTargets = useMemo(() => {
        return [...new Set(configuredRows.map(({ relayUrl }) => relayUrl))];
    }, [configuredRows]);

    const suggestedRelayStatusTargets = useMemo(() => {
        const configured = new Set(configuredRelayStatusTargets);
        return [...new Set(
            suggestedRows
                .map(({ relayUrl }) => relayUrl)
                .filter((relayUrl) => !configured.has(relayUrl))
        )];
    }, [configuredRelayStatusTargets, suggestedRows]);

    const { statusByRelay: configuredRelayConnectionStatusByRelay } = useRelayConnectionSummary(configuredRelayStatusTargets, {
        enabled: view === 'relays',
        probe: relayConnectionProbe,
        refreshIntervalMs: relayConnectionRefreshIntervalMs,
    });

    const checkingConfiguredRelays = useMemo(() => {
        return configuredRows.reduce((count, row) => {
            const status = configuredRelayConnectionStatusByRelay[row.relayUrl];
            return count + (status === 'connected' || status === 'disconnected' ? 0 : 1);
        }, 0);
    }, [configuredRows, configuredRelayConnectionStatusByRelay]);

    const { statusByRelay: suggestedRelayConnectionStatusByRelay } = useRelayConnectionSummary(suggestedRelayStatusTargets, {
        enabled: view === 'relays' && checkingConfiguredRelays === 0,
        probe: relayConnectionProbe,
        refreshIntervalMs: 0,
    });

    const relayConnectionStatusByRelay = useMemo(() => {
        return {
            ...suggestedRelayConnectionStatusByRelay,
            ...configuredRelayConnectionStatusByRelay,
        };
    }, [suggestedRelayConnectionStatusByRelay, configuredRelayConnectionStatusByRelay]);

    const connectedConfiguredRelays = useMemo(() => {
        return configuredRows.reduce(
            (count, row) => count + (configuredRelayConnectionStatusByRelay[row.relayUrl] === 'connected' ? 1 : 0),
            0
        );
    }, [configuredRows, configuredRelayConnectionStatusByRelay]);

    const disconnectedConfiguredRelays = Math.max(
        0,
        configuredRows.length - connectedConfiguredRelays - checkingConfiguredRelays
    );

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

            nextState = addRelay(nextState, normalized, newRelayType);
        }

        persistRelaySettings(nextState);
        setInvalidRelayInputs(invalid);
        setNewRelayInput('');
    };

    const handleRemoveRelay = (relayUrl: string, relayType: RelayType): void => {
        const nextState = removeRelay(relaySettings, relayUrl, relayType);
        persistRelaySettings(nextState);
    };

    const handleAddSuggestedRelay = (relayUrl: string, relayType: RelayType): void => {
        const nextState = addRelay(relaySettings, relayUrl, relayType);
        persistRelaySettings(nextState);
    };

    const handleAddAllSuggestedRelays = (): void => {
        let nextState = relaySettings;
        for (const row of suggestedRows) {
            nextState = addRelay(nextState, row.relayUrl, row.relayType);
        }
        persistRelaySettings(nextState);
    };

    const relayInfoTargets = useMemo(() => {
        return [...new Set([
            ...relaySettings.relays,
            ...normalizedSuggestedByType.nip65Both,
            ...normalizedSuggestedByType.nip65Read,
            ...normalizedSuggestedByType.nip65Write,
            ...normalizedSuggestedByType.dmInbox,
        ])];
    }, [relaySettings.relays, normalizedSuggestedByType]);

    const openRelayDetails = (relayUrl: string, source: RelaySource, relayType: RelayType): void => {
        setSelectedRelay({ relayUrl, source, relayType });
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
            <DialogContent className={`nostr-settings-dialog${view === 'relays' || view === 'relay-detail' ? ' nostr-settings-dialog-relays' : ''}`} aria-label="Ajustes">
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
                        <Slider
                            id="nostr-occupied-zoom-level"
                            aria-label="Occupied labels zoom level"
                            min={1}
                            max={20}
                            step={1}
                            value={[uiSettings.occupiedLabelsZoomLevel]}
                            onValueChange={(values) => {
                                const nextValue = values[0];
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
                        <Slider
                            id="nostr-street-zoom-level"
                            aria-label="Street labels zoom level"
                            min={1}
                            max={20}
                            step={1}
                            disabled={!uiSettings.streetLabelsEnabled}
                            value={[uiSettings.streetLabelsZoomLevel]}
                            onValueChange={(values) => {
                                const nextValue = values[0];
                                if (!Number.isFinite(nextValue)) {
                                    return;
                                }
                                persistUiSettings({
                                    ...uiSettings,
                                    streetLabelsZoomLevel: nextValue,
                                });
                            }}
                        />

                        <Separator className="nostr-divider" />

                        <div className="nostr-ui-slider-row">
                            <Label className="nostr-label" htmlFor="nostr-traffic-count">Cars in city</Label>
                            <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesCount}</span>
                        </div>
                        <Slider
                            id="nostr-traffic-count"
                            min={0}
                            max={50}
                            step={1}
                            aria-label="Cars in city"
                            value={[uiSettings.trafficParticlesCount]}
                            onValueChange={(values) => {
                                const nextValue = values[0];
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
                            <Label className="nostr-label" htmlFor="nostr-traffic-speed">Cars speed</Label>
                            <span className="nostr-ui-slider-value">{uiSettings.trafficParticlesSpeed.toFixed(1)}x</span>
                        </div>
                        <Slider
                            id="nostr-traffic-speed"
                            min={0.2}
                            max={3}
                            step={0.1}
                            aria-label="Cars speed"
                            value={[uiSettings.trafficParticlesSpeed]}
                            onValueChange={(values) => {
                                const nextValue = values[0];
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
                        <p className="nostr-relays-help">Conecta varios relays. Puedes agregar uno por vez y elegir categoria.</p>

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
                                                            <p className="nostr-relay-summary-sub">Configured relay</p>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">{RELAY_TYPE_LABELS[relayType]}</Badge>
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
                                                                aria-label={`Abrir acciones para ${relayUrl} (${RELAY_TYPE_LABELS[relayType]})`}
                                                                onClick={openRelayActionsMenu}
                                                            >
                                                                <EllipsisVerticalIcon data-icon="inline-start" />
                                                            </Button>
                                                        </ContextMenuTrigger>
                                                        <ContextMenuContent>
                                                            <ContextMenuGroup>
                                                                <ContextMenuItem onSelect={() => openRelayDetails(relayUrl, 'configured', relayType)}>
                                                                    Details
                                                                </ContextMenuItem>
                                                                <ContextMenuItem variant="destructive" onSelect={() => handleRemoveRelay(relayUrl, relayType)}>
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

                        <InputGroup>
                            <InputGroupInput
                                aria-label="Relay URLs"
                                placeholder="wss://relay.example"
                                value={newRelayInput}
                                onChange={(event) => setNewRelayInput(event.target.value)}
                            />
                            <InputGroupAddon align="inline-end">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <InputGroupButton variant="ghost" aria-label="Relay category">
                                            {RELAY_TYPE_LABELS[newRelayType]}
                                            <ChevronDownIcon />
                                        </InputGroupButton>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuGroup>
                                            {RELAY_TYPES.map((relayType) => (
                                                <DropdownMenuItem
                                                    key={`relay-type-${relayType}`}
                                                    onSelect={() => setNewRelayType(relayType)}
                                                >
                                                    {RELAY_TYPE_LABELS[relayType]}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <InputGroupButton
                                    variant="secondary"
                                    onClick={handleAddRelays}
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

                        {suggestedRows.length > 0 ? (
                            <section className="nostr-relay-suggested">
                                <div className="nostr-relay-suggested-header">
                                    <p>Relays sugeridos por protocolo (NIP-65 / NIP-17)</p>
                                    <Button type="button" variant="outline" className="nostr-relay-add-suggested" onClick={handleAddAllSuggestedRelays}>
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
                                                                    <p className="nostr-relay-summary-sub">Suggested by protocol metadata</p>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline">{RELAY_TYPE_LABELS[relayType]}</Badge>
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
                                                                        aria-label={`Abrir acciones sugeridas para ${relayUrl} (${RELAY_TYPE_LABELS[relayType]})`}
                                                                        onClick={openRelayActionsMenu}
                                                                    >
                                                                        <EllipsisVerticalIcon data-icon="inline-start" />
                                                                    </Button>
                                                                </ContextMenuTrigger>
                                                                <ContextMenuContent>
                                                                    <ContextMenuGroup>
                                                                        <ContextMenuItem onSelect={() => openRelayDetails(relayUrl, 'suggested', relayType)}>
                                                                            Details
                                                                        </ContextMenuItem>
                                                                        <ContextMenuItem onSelect={() => handleAddSuggestedRelay(relayUrl, relayType)}>
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
                        ) : hasSuggestedRelays ? (
                            <p className="nostr-relays-help">Todos los relays sugeridos ya estan agregados.</p>
                        ) : (
                            <p className="nostr-relays-help">No hay relays sugeridos todavia. Carga una npub para intentar descubrirlos via NIP-65 y NIP-17.</p>
                        )}
                    </div>
                ) : view === 'relay-detail' && selectedRelayDetails ? (
                    <div className="nostr-relays-content">
                        {selectedRelayInfo?.status === 'loading' ? (
                            <p className="nostr-relay-meta-loading"><Spinner /> Cargando metadata NIP-11...</p>
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
                                <p className="nostr-relay-summary-sub">
                                    {selectedRelayDetails.source === 'configured' ? 'Configured relay' : 'Suggested by protocol metadata'} · {RELAY_TYPE_LABELS[selectedRelay.relayType]}
                                </p>
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
                                        <TableCell className="nostr-relay-detail-value">{selectedRelayDetails.source === 'configured' ? 'Configured' : 'Suggested (NIP-65/NIP-17)'}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableHead className="nostr-relay-detail-key">Category</TableHead>
                                        <TableCell className="nostr-relay-detail-value">{RELAY_TYPE_LABELS[selectedRelay.relayType]}</TableCell>
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
                                <li>NIP-65 (relay list metadata)</li>
                                <li>NIP-17 (DM inbox relays)</li>
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

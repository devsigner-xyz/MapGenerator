import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement } from 'react';
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
import { encodeHexToNpub, isHexKey } from '../../nostr/npub';
import type { MapBridge } from '../map-bridge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { SettingsAdvancedPage } from './settings-pages/SettingsAdvancedPage';
import { SettingsAboutPage } from './settings-pages/SettingsAboutPage';
import { SettingsRelayDetailPage } from './settings-pages/SettingsRelayDetailPage';
import { SettingsRelaysPage } from './settings-pages/SettingsRelaysPage';
import { SettingsShortcutsPage } from './settings-pages/SettingsShortcutsPage';
import type { RelayDetails, RelayFee, RelayInformationDocument, RelayRow, RelaySelection, RelaySource, SettingsView } from './settings-pages/types';
import { SettingsUiPage } from './settings-pages/SettingsUiPage';
import { SettingsZapsPage } from './settings-pages/SettingsZapsPage';
import { useRelayMetadataByUrlQuery } from '../query/relay-metadata.query';

export type { SettingsView } from './settings-pages/types';

export interface MapSettingsPageProps {
    ownerPubkey?: string;
    mapBridge: MapBridge | null;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
    onUiSettingsChange?: (nextState: UiSettingsState) => void;
    zapSettings?: ZapSettingsState;
    onZapSettingsChange?: (nextState: ZapSettingsState) => void;
    initialView?: SettingsView;
    variant?: 'dialog' | 'surface';
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

function describeRelay(relayUrl: string, source: RelaySource): RelayDetails {
    try {
        const parsed = new URL(relayUrl);
        return {
            relayUrl,
            source,
            host: parsed.hostname || 'unknown',
        };
    } catch {
        return {
            relayUrl,
            source,
            host: 'unknown',
        };
    }
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

function toAdminIdentity(pubkey?: string): string | null {
    if (typeof pubkey !== 'string') {
        return null;
    }

    const normalized = pubkey.trim().toLowerCase();
    if (!isHexKey(normalized)) {
        return null;
    }

    try {
        return encodeHexToNpub(normalized);
    } catch {
        return null;
    }
}

function hasNip11Metadata(document?: RelayInformationDocument): boolean {
    if (!document) {
        return false;
    }

    return Object.keys(document).length > 0;
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

export function MapSettingsPage({
    ownerPubkey,
    mapBridge,
    suggestedRelays = EMPTY_RELAYS,
    suggestedRelaysByType,
    relayConnectionProbe,
    relayConnectionRefreshIntervalMs,
    onUiSettingsChange,
    zapSettings,
    onZapSettingsChange,
    initialView = 'ui',
    variant = 'dialog',
    onClose,
}: MapSettingsPageProps) {
    const [view, setView] = useState<SettingsView>(initialView);
    const [relaySettings, setRelaySettings] = useState<RelaySettingsState>(() => loadRelaySettings({ ownerPubkey }));
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());
    const [zapSettingsState, setZapSettingsState] = useState<ZapSettingsState>(() => zapSettings ?? loadZapSettings({ ownerPubkey }));
    const [newRelayInput, setNewRelayInput] = useState('');
    const [newRelayType, setNewRelayType] = useState<RelayType>('nip65Both');
    const [newZapAmountInput, setNewZapAmountInput] = useState('');
    const [invalidRelayInputs, setInvalidRelayInputs] = useState<string[]>([]);
    const [selectedRelay, setSelectedRelay] = useState<RelaySelection | null>(null);
    const [copiedRelayIdentityKey, setCopiedRelayIdentityKey] = useState<string | null>(null);
    const settingsHostRef = useRef<HTMLDivElement | null>(null);
    const relayCopyResetTimeoutRef = useRef<number | null>(null);

    const persistRelaySettings = (nextState: RelaySettingsState): void => {
        const savedState = saveRelaySettings(nextState, { ownerPubkey });
        setRelaySettings(savedState);
    };

    const persistUiSettings = (nextState: UiSettingsState): void => {
        const savedState = saveUiSettings(nextState);
        setUiSettings(savedState);
        onUiSettingsChange?.(savedState);
    };

    const persistZapSettings = (nextState: ZapSettingsState): void => {
        const savedState = saveZapSettings(nextState, { ownerPubkey });
        setZapSettingsState(savedState);
        onZapSettingsChange?.(savedState);
    };

    useEffect(() => {
        setRelaySettings(loadRelaySettings({ ownerPubkey }));
        setZapSettingsState(zapSettings ?? loadZapSettings({ ownerPubkey }));
    }, [ownerPubkey, zapSettings]);

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

    const relayMetadataEnabled = view === 'relays' || view === 'relay-detail';
    const relayInfoByUrl = useRelayMetadataByUrlQuery({
        relayUrls: relayInfoTargets,
        enabled: relayMetadataEnabled,
    });

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
        setView(initialView);
    }, [initialView]);

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
        return () => {
            if (relayCopyResetTimeoutRef.current !== null) {
                window.clearTimeout(relayCopyResetTimeoutRef.current);
            }
        };
    }, []);

    const selectedRelayDetails = selectedRelay ? describeRelay(selectedRelay.relayUrl, selectedRelay.source) : null;
    const selectedRelayInfo = selectedRelay ? relayInfoByUrl[selectedRelay.relayUrl] : undefined;
    const selectedRelayDocument = selectedRelayInfo?.status === 'ready' ? selectedRelayInfo.data : undefined;
    const selectedRelayAdminIdentity = toAdminIdentity(selectedRelayDocument?.pubkey);
    const selectedRelayConnectionStatus = selectedRelay ? relayConnectionStatusByRelay[selectedRelay.relayUrl] : undefined;
    const canGoBack = view === 'relay-detail';
    const relayHasNip11Metadata = hasNip11Metadata(selectedRelayDocument);
    const relayEventLimit = selectedRelayDocument?.limitation?.max_limit
        ?? selectedRelayDocument?.limitation?.default_limit;
    const relayHasFees = Boolean(
        (selectedRelayDocument?.fees?.admission && selectedRelayDocument.fees.admission.length > 0)
        || (selectedRelayDocument?.fees?.subscription && selectedRelayDocument.fees.subscription.length > 0)
        || (selectedRelayDocument?.fees?.publication && selectedRelayDocument.fees.publication.length > 0)
    );

    const copyRelayIdentity = async (value: string, key: string): Promise<void> => {
        if (!value || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            setCopiedRelayIdentityKey(key);
            if (relayCopyResetTimeoutRef.current !== null) {
                window.clearTimeout(relayCopyResetTimeoutRef.current);
            }
            relayCopyResetTimeoutRef.current = window.setTimeout(() => {
                setCopiedRelayIdentityKey((current) => (current === key ? null : current));
            }, 1800);
        } catch {
            setCopiedRelayIdentityKey(null);
        }
    };

    const settingsContent = (
        <>
            {view === 'advanced' ? (
                <SettingsAdvancedPage settingsHostRef={settingsHostRef} />
            ) : view === 'ui' ? (
                <SettingsUiPage
                    uiSettings={uiSettings}
                    onPersistUiSettings={persistUiSettings}
                />
            ) : view === 'relays' ? (
                <SettingsRelaysPage
                    configuredRows={configuredRows}
                    suggestedRows={suggestedRows}
                    connectedConfiguredRelays={connectedConfiguredRelays}
                    disconnectedConfiguredRelays={disconnectedConfiguredRelays}
                    relayInfoByUrl={relayInfoByUrl}
                    configuredRelayConnectionStatusByRelay={configuredRelayConnectionStatusByRelay}
                    relayConnectionStatusByRelay={relayConnectionStatusByRelay}
                    relayTypeLabels={RELAY_TYPE_LABELS}
                    newRelayInput={newRelayInput}
                    newRelayType={newRelayType}
                    invalidRelayInputs={invalidRelayInputs}
                    onNewRelayInputChange={setNewRelayInput}
                    onNewRelayTypeChange={setNewRelayType}
                    onAddRelays={handleAddRelays}
                    onOpenRelayDetails={openRelayDetails}
                    onRemoveRelay={handleRemoveRelay}
                    onAddSuggestedRelay={handleAddSuggestedRelay}
                    onAddAllSuggestedRelays={handleAddAllSuggestedRelays}
                    onOpenRelayActionsMenu={openRelayActionsMenu}
                    describeRelay={describeRelay}
                    relayAvatarFallback={relayAvatarFallback}
                    relayConnectionBadge={relayConnectionBadge}
                />
            ) : view === 'relay-detail' && selectedRelayDetails && selectedRelay ? (
                <SettingsRelayDetailPage
                    selectedRelay={selectedRelay}
                    selectedRelayDetails={selectedRelayDetails}
                    selectedRelayInfo={selectedRelayInfo}
                    selectedRelayDocument={selectedRelayDocument}
                    selectedRelayAdminIdentity={selectedRelayAdminIdentity}
                    selectedRelayConnectionStatus={selectedRelayConnectionStatus}
                    relayHasNip11Metadata={relayHasNip11Metadata}
                    relayEventLimit={relayEventLimit}
                    relayHasFees={relayHasFees}
                    copiedRelayIdentityKey={copiedRelayIdentityKey}
                    relayTypeLabels={RELAY_TYPE_LABELS}
                    relayAvatarFallback={relayAvatarFallback}
                    relayConnectionBadge={relayConnectionBadge}
                    formatRelayFee={formatRelayFee}
                    onCopyRelayIdentity={copyRelayIdentity}
                />
            ) : view === 'about' ? (
                <SettingsAboutPage />
            ) : view === 'zaps' ? (
                <SettingsZapsPage
                    zapSettings={zapSettingsState}
                    newZapAmountInput={newZapAmountInput}
                    onNewZapAmountInputChange={setNewZapAmountInput}
                    onUpdateZapAmount={(index, value) => {
                        persistZapSettings(updateZapAmount(zapSettingsState, index, value));
                    }}
                    onRemoveZapAmount={(index) => {
                        persistZapSettings(removeZapAmount(zapSettingsState, index));
                    }}
                    onAddZapAmount={() => {
                        const nextValue = Number(newZapAmountInput.trim());
                        if (!Number.isFinite(nextValue)) {
                            return;
                        }
                        persistZapSettings(addZapAmount(zapSettingsState, nextValue));
                        setNewZapAmountInput('');
                    }}
                />
            ) : (
                <SettingsShortcutsPage />
            )}

            {variant === 'dialog' ? (
                canGoBack ? (
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
                )
            ) : canGoBack ? (
                <DialogFooter className="sm:justify-start">
                    <Button type="button" variant="outline" onClick={() => setView('relays')}>
                        Volver
                    </Button>
                </DialogFooter>
            ) : null}
        </>
    );

    if (variant === 'surface') {
        return (
            <section className="nostr-routed-surface" aria-label="Ajustes">
                <div className="nostr-routed-surface-content">
                    <div className={`nostr-settings-page nostr-routed-surface-panel nostr-page-layout${view === 'relays' || view === 'relay-detail' ? ' nostr-settings-page-relays' : ''}`}>
                        <h2 className="sr-only">Ajustes</h2>
                        <p className="sr-only">Configuracion del overlay del mapa.</p>
                        {settingsContent}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <Dialog open onOpenChange={(open) => {
            if (!open) {
                onClose();
            }
        }}>
            <DialogContent className={`nostr-settings-dialog${view === 'relays' || view === 'relay-detail' ? ' nostr-settings-dialog-relays' : ''}`} aria-label="Ajustes">
                <DialogTitle className="sr-only">Ajustes</DialogTitle>
                <DialogDescription className="sr-only">Configuracion del overlay del mapa.</DialogDescription>
                {settingsContent}
            </DialogContent>
        </Dialog>
    );
}

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
    addRelay,
    DEFAULT_SEARCH_RELAYS,
    getRelaySetByType,
    loadRelaySettings,
    removeRelay,
    RELAY_TYPES,
    saveRelaySettings,
    type RelaySettingsByType,
    type RelaySettingsState,
    type RelayType,
} from '../../../../nostr/relay-settings';
import { getBootstrapRelays, mergeRelaySets } from '../../../../nostr/relay-policy';
import { useRelayConnectionSummary, type RelayConnectionProbe, type RelayConnectionStatus } from '../../../hooks/useRelayConnectionSummary';
import { useRelayMetadataByUrlQuery } from '../../../query/relay-metadata.query';
import type { RelayInformationDocument } from '../../settings-pages/types';
import {
    buildRelayRowsByUrl,
    EMPTY_RELAYS,
    normalizeRelayInput,
    RELAY_TYPE_LABELS,
    relayAvatarFallback,
    relayConnectionBadge,
    describeRelay,
} from './relays-shared';

interface UseRelaysSettingsControllerInput {
    ownerPubkey?: string;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    relayConnectionProbe?: RelayConnectionProbe;
    relayConnectionRefreshIntervalMs?: number;
    onRelaySettingsChange?: (nextState: RelaySettingsState) => void;
}

export interface RelaysSettingsController {
    configuredRows: ReturnType<typeof buildRelayRowsByUrl>;
    suggestedRows: ReturnType<typeof buildRelayRowsByUrl>;
    searchConfiguredRows: ReturnType<typeof buildRelayRowsByUrl>;
    searchSuggestedRows: ReturnType<typeof buildRelayRowsByUrl>;
    connectedConfiguredRelays: number;
    disconnectedConfiguredRelays: number;
    relayInfoByUrl: Record<string, { data?: RelayInformationDocument }>;
    configuredRelayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayConnectionStatusByRelay: Record<string, RelayConnectionStatus | undefined>;
    relayTypeLabels: typeof RELAY_TYPE_LABELS;
    newRelayInput: string;
    newRelayType: RelayType;
    newSearchRelayInput: string;
    invalidRelayInputs: string[];
    invalidSearchRelayInputs: string[];
    onNewRelayInputChange: (value: string) => void;
    onNewRelayTypeChange: (value: RelayType) => void;
    onNewSearchRelayInputChange: (value: string) => void;
    onAddRelays: () => void;
    onRemoveRelay: (relayUrl: string) => void;
    onAddSuggestedRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedRelays: () => void;
    onResetRelaysToDefault: () => void;
    onAddSearchRelays: () => void;
    onRemoveSearchRelay: (relayUrl: string) => void;
    onAddSuggestedSearchRelay: (relayUrl: string, relayTypes: RelayType[]) => void;
    onAddAllSuggestedSearchRelays: () => void;
    onResetSearchRelaysToDefault: () => void;
    onOpenRelayActionsMenu: (event: MouseEvent<HTMLButtonElement>) => void;
    describeRelay: typeof describeRelay;
    relayAvatarFallback: typeof relayAvatarFallback;
    relayConnectionBadge: typeof relayConnectionBadge;
}

export function useRelaysSettingsController(input: UseRelaysSettingsControllerInput): RelaysSettingsController {
    const {
        ownerPubkey,
        suggestedRelays = EMPTY_RELAYS,
        suggestedRelaysByType,
        relayConnectionProbe,
        relayConnectionRefreshIntervalMs,
        onRelaySettingsChange,
    } = input;
    const [relaySettings, setRelaySettings] = useState<RelaySettingsState>(() => loadRelaySettings(
        ownerPubkey ? { ownerPubkey } : undefined
    ));
    const [newRelayInput, setNewRelayInput] = useState('');
    const [newRelayType, setNewRelayType] = useState<RelayType>('nip65Both');
    const [newSearchRelayInput, setNewSearchRelayInput] = useState('');
    const [invalidRelayInputs, setInvalidRelayInputs] = useState<string[]>([]);
    const [invalidSearchRelayInputs, setInvalidSearchRelayInputs] = useState<string[]>([]);

    const persistRelaySettings = (nextState: RelaySettingsState): void => {
        const savedState = saveRelaySettings(nextState, ownerPubkey ? { ownerPubkey } : undefined);
        setRelaySettings(savedState);
        onRelaySettingsChange?.(savedState);
    };

    useEffect(() => {
        setRelaySettings(loadRelaySettings(ownerPubkey ? { ownerPubkey } : undefined));
    }, [ownerPubkey]);

    const normalizedSuggestedByType = useMemo<RelaySettingsByType>(() => {
        return {
            nip65Both: mergeRelaySets(suggestedRelaysByType?.nip65Both ?? [], suggestedRelays),
            nip65Read: mergeRelaySets(suggestedRelaysByType?.nip65Read ?? []),
            nip65Write: mergeRelaySets(suggestedRelaysByType?.nip65Write ?? []),
            dmInbox: mergeRelaySets(suggestedRelaysByType?.dmInbox ?? []),
            search: mergeRelaySets(suggestedRelaysByType?.search ?? DEFAULT_SEARCH_RELAYS),
        };
    }, [suggestedRelaysByType, suggestedRelays]);

    const configuredRows = useMemo(() => {
        return buildRelayRowsByUrl({
            ...relaySettings.byType,
            search: [],
        });
    }, [relaySettings.byType]);

    const searchConfiguredRows = useMemo(() => {
        return buildRelayRowsByUrl({
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
            search: relaySettings.byType.search,
        });
    }, [relaySettings.byType.search]);

    const suggestedRows = useMemo(() => {
        const missingByType: RelaySettingsByType = {
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
            search: [],
        };

        for (const relayType of RELAY_TYPES.filter((currentRelayType) => currentRelayType !== 'search')) {
            const configuredSet = new Set(getRelaySetByType(relaySettings, relayType));
            missingByType[relayType] = normalizedSuggestedByType[relayType]
                .filter((relayUrl) => !configuredSet.has(relayUrl));
        }

        return buildRelayRowsByUrl(missingByType);
    }, [normalizedSuggestedByType, relaySettings]);

    const searchSuggestedRows = useMemo(() => {
        const configuredSet = new Set(relaySettings.byType.search);
        return buildRelayRowsByUrl({
            nip65Both: [],
            nip65Read: [],
            nip65Write: [],
            dmInbox: [],
            search: normalizedSuggestedByType.search.filter((relayUrl) => !configuredSet.has(relayUrl)),
        });
    }, [normalizedSuggestedByType.search, relaySettings.byType.search]);

    const configuredRelayStatusTargets = useMemo(() => {
        return [...new Set([
            ...configuredRows.map(({ relayUrl }) => relayUrl),
            ...searchConfiguredRows.map(({ relayUrl }) => relayUrl),
        ])];
    }, [configuredRows, searchConfiguredRows]);

    const suggestedRelayStatusTargets = useMemo(() => {
        const configured = new Set(configuredRelayStatusTargets);
        return [...new Set(
            [...suggestedRows, ...searchSuggestedRows]
                .map(({ relayUrl }) => relayUrl)
                .filter((relayUrl) => !configured.has(relayUrl))
        )];
    }, [configuredRelayStatusTargets, searchSuggestedRows, suggestedRows]);

    const { statusByRelay: configuredRelayConnectionStatusByRelay } = useRelayConnectionSummary(configuredRelayStatusTargets, {
        enabled: true,
        ...(relayConnectionProbe ? { probe: relayConnectionProbe } : {}),
        ...(relayConnectionRefreshIntervalMs !== undefined ? { refreshIntervalMs: relayConnectionRefreshIntervalMs } : {}),
        maxConcurrentProbes: 3,
    });

    const checkingConfiguredRelays = useMemo(() => {
        return configuredRelayStatusTargets.reduce((count, relayUrl) => {
            const status = configuredRelayConnectionStatusByRelay[relayUrl];
            return count + (status === 'connected' || status === 'disconnected' ? 0 : 1);
        }, 0);
    }, [configuredRelayStatusTargets, configuredRelayConnectionStatusByRelay]);

    const { statusByRelay: suggestedRelayConnectionStatusByRelay } = useRelayConnectionSummary(suggestedRelayStatusTargets, {
        enabled: checkingConfiguredRelays === 0,
        ...(relayConnectionProbe ? { probe: relayConnectionProbe } : {}),
        refreshIntervalMs: 0,
        maxConcurrentProbes: 2,
    });

    const relayConnectionStatusByRelay = useMemo(() => {
        return {
            ...suggestedRelayConnectionStatusByRelay,
            ...configuredRelayConnectionStatusByRelay,
        };
    }, [suggestedRelayConnectionStatusByRelay, configuredRelayConnectionStatusByRelay]);

    const connectedConfiguredRelays = useMemo(() => {
        return configuredRelayStatusTargets.reduce(
            (count, relayUrl) => count + (configuredRelayConnectionStatusByRelay[relayUrl] === 'connected' ? 1 : 0),
            0
        );
    }, [configuredRelayStatusTargets, configuredRelayConnectionStatusByRelay]);

    const disconnectedConfiguredRelays = Math.max(
        0,
        configuredRelayStatusTargets.length - connectedConfiguredRelays - checkingConfiguredRelays
    );

    const relayInfoTargets = useMemo(() => {
        return [...new Set([
            ...relaySettings.relays,
            ...normalizedSuggestedByType.nip65Both,
            ...normalizedSuggestedByType.nip65Read,
            ...normalizedSuggestedByType.nip65Write,
            ...normalizedSuggestedByType.dmInbox,
            ...relaySettings.byType.search,
            ...normalizedSuggestedByType.search,
        ])];
    }, [relaySettings.byType.search, relaySettings.relays, normalizedSuggestedByType]);

    const relayInfoByUrl = useRelayMetadataByUrlQuery({
        relayUrls: relayInfoTargets,
        enabled: true,
    });

    const onAddRelays = (): void => {
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

    const onRemoveRelay = (relayUrl: string): void => {
        let nextState = relaySettings;
        for (const relayType of RELAY_TYPES.filter((relayType) => relayType !== 'search')) {
            nextState = removeRelay(nextState, relayUrl, relayType);
        }
        persistRelaySettings(nextState);
    };

    const onAddSuggestedRelay = (relayUrl: string, relayTypes: RelayType[]): void => {
        let nextState = relaySettings;
        for (const relayType of relayTypes) {
            nextState = addRelay(nextState, relayUrl, relayType);
        }
        persistRelaySettings(nextState);
    };

    const onAddAllSuggestedRelays = (): void => {
        let nextState = relaySettings;
        for (const row of suggestedRows) {
            for (const relayType of row.relayTypes) {
                nextState = addRelay(nextState, row.relayUrl, relayType);
            }
        }
        persistRelaySettings(nextState);
    };

    const onResetRelaysToDefault = (): void => {
        const bootstrap = getBootstrapRelays();
        persistRelaySettings({
            relays: bootstrap,
            byType: {
                nip65Both: bootstrap,
                nip65Read: bootstrap,
                nip65Write: bootstrap,
                dmInbox: [],
                search: relaySettings.byType.search,
            },
        });
        setInvalidRelayInputs([]);
        setNewRelayInput('');
        setNewRelayType('nip65Both');
    };

    const onAddSearchRelays = (): void => {
        const lines = newSearchRelayInput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length === 0) {
            setInvalidSearchRelayInputs([]);
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

            nextState = addRelay(nextState, normalized, 'search');
        }

        persistRelaySettings(nextState);
        setInvalidSearchRelayInputs(invalid);
        setNewSearchRelayInput('');
    };

    const onRemoveSearchRelay = (relayUrl: string): void => {
        persistRelaySettings(removeRelay(relaySettings, relayUrl, 'search'));
    };

    const onAddSuggestedSearchRelay = (relayUrl: string, relayTypes: RelayType[]): void => {
        let nextState = relaySettings;
        for (const relayType of relayTypes) {
            nextState = addRelay(nextState, relayUrl, relayType);
        }
        persistRelaySettings(nextState);
    };

    const onAddAllSuggestedSearchRelays = (): void => {
        let nextState = relaySettings;
        for (const row of searchSuggestedRows) {
            for (const relayType of row.relayTypes) {
                nextState = addRelay(nextState, row.relayUrl, relayType);
            }
        }
        persistRelaySettings(nextState);
    };

    const onResetSearchRelaysToDefault = (): void => {
        persistRelaySettings({
            ...relaySettings,
            byType: {
                ...relaySettings.byType,
                search: [...DEFAULT_SEARCH_RELAYS],
            },
        });
        setInvalidSearchRelayInputs([]);
        setNewSearchRelayInput('');
    };

    const onOpenRelayActionsMenu = (event: MouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
        }));
    };

    return {
        configuredRows,
        suggestedRows,
        searchConfiguredRows,
        searchSuggestedRows,
        connectedConfiguredRelays,
        disconnectedConfiguredRelays,
        relayInfoByUrl,
        configuredRelayConnectionStatusByRelay,
        relayConnectionStatusByRelay,
        relayTypeLabels: RELAY_TYPE_LABELS,
        newRelayInput,
        newRelayType,
        newSearchRelayInput,
        invalidRelayInputs,
        invalidSearchRelayInputs,
        onNewRelayInputChange: setNewRelayInput,
        onNewRelayTypeChange: setNewRelayType,
        onNewSearchRelayInputChange: setNewSearchRelayInput,
        onAddRelays,
        onRemoveRelay,
        onAddSuggestedRelay,
        onAddAllSuggestedRelays,
        onResetRelaysToDefault,
        onAddSearchRelays,
        onRemoveSearchRelay,
        onAddSuggestedSearchRelay,
        onAddAllSuggestedSearchRelays,
        onResetSearchRelaysToDefault,
        onOpenRelayActionsMenu,
        describeRelay,
        relayAvatarFallback,
        relayConnectionBadge,
    };
}

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { verifyEvent } from 'nostr-tools/pure';
import { toast } from 'sonner';
import { translate } from '../../i18n/translate';
import type { AppLocale } from '../../i18n/types';
import { createNwcClient, createNwcRelayIo, parseNwcConnectionUri, resolveNwcEncryptionMode, resolveNwcInfoCapabilities } from '../../nostr/nwc';
import type { RelaySettingsState } from '../../nostr/relay-settings';
import type { NostrClient, NostrEvent, NostrProfile } from '../../nostr/types';
import { addWalletActivity, loadWalletActivity, markWalletActivityFailed, markWalletActivitySucceeded, saveWalletActivity } from '../../nostr/wallet-activity';
import { loadWalletSettings, saveWalletSettings } from '../../nostr/wallet-settings';
import type { WalletActivityState, WalletCapabilities, WalletSettingsState } from '../../nostr/wallet-types';
import { detectWebLnProvider, resolveWebLnCapabilities } from '../../nostr/webln';
import { requestEventZapInvoice, requestProfileZapInvoice } from '../../nostr/zaps';

export interface UseWalletZapControllerInput {
    ownerPubkey?: string;
    createClient?: (relays?: string[]) => NostrClient;
    location?: { pathname: string; search: string };
    navigate?: (to: string, options?: { replace?: boolean }) => void;
    language?: AppLocale;
    relaySettingsSnapshot?: RelaySettingsState;
    profiles?: Record<string, NostrProfile>;
    followerProfiles?: Record<string, NostrProfile>;
    ownerProfile?: NostrProfile;
    writeGateway?: {
        publishEvent(event: {
            kind: number;
            content: string;
            created_at: number;
            tags: string[][];
        }): Promise<NostrEvent>;
    };
    onRecordOptimisticZap?: (input: { eventId?: string; amount: number }) => void;
}

type WalletStorageOptions = { ownerPubkey: string } | undefined;

interface PendingZapIntent {
    ownerScope: string;
    targetPubkey: string;
    amount: number;
    eventId?: string;
    eventKind?: number;
    originPath: string;
    phase: 'navigating' | 'ready' | 'paused';
}

export interface ZapIntentInput {
    targetPubkey: string;
    amount: number;
    eventId?: string;
    eventKind?: number;
}

type ZapExecutionResult = 'success' | 'retryable_failure' | 'definitive_failure';

export interface WalletZapController {
    walletSettings: WalletSettingsState;
    walletActivity: WalletActivityState;
    walletNwcUriInput: string;
    setWalletNwcUriInput: Dispatch<SetStateAction<string>>;
    walletStorageOptions: WalletStorageOptions;
    handleZapIntent: (input: ZapIntentInput) => Promise<void>;
    connectWebLnWallet: (options?: { silent?: boolean }) => Promise<boolean>;
    connectNwcWallet: () => Promise<void>;
    disconnectWallet: () => void;
    refreshWallet: () => Promise<void>;
}

function createWalletStorageOptions(ownerPubkey?: string): WalletStorageOptions {
    return ownerPubkey ? { ownerPubkey } : undefined;
}

function shouldRestoreRememberedWebLn(settings: WalletSettingsState): boolean {
    return Boolean(
        settings.activeConnection?.method === 'webln'
        && settings.activeConnection.restoreState === 'reconnect-required'
    );
}

function isZapIntentInput(input: unknown): input is ZapIntentInput {
    if (!input || typeof input !== 'object') {
        return false;
    }

    const candidate = input as Partial<ZapIntentInput>;
    return typeof candidate.targetPubkey === 'string'
        && candidate.targetPubkey.length > 0
        && typeof candidate.amount === 'number'
        && Number.isFinite(candidate.amount);
}

function isWalletReadyForPayments(connection: WalletSettingsState['activeConnection']): boolean {
    if (!connection?.capabilities.payInvoice) {
        return false;
    }

    if (connection.method === 'webln' || connection.method === 'nwc') {
        return connection.restoreState === 'connected';
    }

    return true;
}

async function fetchNwcInfo(input: {
    createClient: ((relays?: string[]) => NostrClient) | undefined;
    connection: {
        walletServicePubkey: string;
        relays: string[];
    };
}): Promise<{ capabilities: WalletCapabilities; encryption: 'nip44_v2' | 'nip04' }> {
    if (!input.createClient) {
        throw new Error('NWC client factory is not available');
    }

    const client = input.createClient(input.connection.relays);

    await client.connect();
    const infoEvent = await client.fetchLatestReplaceableEvent(input.connection.walletServicePubkey, 13194);
    if (!infoEvent) {
        throw new Error('NWC info event was not found');
    }
    if (infoEvent.kind !== 13194) {
        throw new Error('NWC info event kind is invalid');
    }
    if (infoEvent.pubkey !== input.connection.walletServicePubkey) {
        throw new Error('NWC info event pubkey does not match wallet service pubkey');
    }
    if (!verifyEvent(infoEvent as Parameters<typeof verifyEvent>[0])) {
        throw new Error('NWC info event signature is invalid');
    }

    const capabilities = resolveNwcInfoCapabilities(infoEvent.content);
    if (!capabilities.payInvoice) {
        throw new Error('NWC wallet does not support pay_invoice');
    }

    return {
        capabilities,
        encryption: resolveNwcEncryptionMode(infoEvent.tags),
    };
}

async function withNwcClient<T>(
    connection: Extract<NonNullable<WalletSettingsState['activeConnection']>, { method: 'nwc' }>,
    operation: (client: ReturnType<typeof createNwcClient>) => Promise<T>,
): Promise<T> {
    const io = createNwcRelayIo(connection.relays);
    const client = createNwcClient({ connection, io });
    try {
        return await operation(client);
    } finally {
        io.close?.();
    }
}

export function useWalletZapController(input: UseWalletZapControllerInput): WalletZapController {
    const walletStorageOptions = useMemo(
        () => createWalletStorageOptions(input.ownerPubkey),
        [input.ownerPubkey],
    );
    const ownerScope = input.ownerPubkey ?? '';
    const currentOwnerScopeRef = useRef(ownerScope);
    currentOwnerScopeRef.current = ownerScope;
    const language = input.language ?? 'es';
    const [walletSettings, setWalletSettings] = useState<WalletSettingsState>(() => loadWalletSettings(walletStorageOptions));
    const [walletActivity, setWalletActivity] = useState<WalletActivityState>(() => loadWalletActivity(walletStorageOptions));
    const [walletNwcUriInput, setWalletNwcUriInput] = useState('');
    const [pendingZapIntent, setPendingZapIntent] = useState<PendingZapIntent | null>(null);
    const [resumingZap, setResumingZap] = useState(false);
    const shouldAutoRestoreRememberedWebLnRef = useRef(shouldRestoreRememberedWebLn(walletSettings));

    useEffect(() => {
        const nextWalletSettings = loadWalletSettings(walletStorageOptions);
        shouldAutoRestoreRememberedWebLnRef.current = shouldRestoreRememberedWebLn(nextWalletSettings);
        setWalletSettings(nextWalletSettings);
        setWalletActivity(loadWalletActivity(walletStorageOptions));
        setWalletNwcUriInput('');
        setPendingZapIntent(null);
        setResumingZap(false);
    }, [walletStorageOptions]);

    const persistWalletSettings = useCallback((nextState: WalletSettingsState): WalletSettingsState => {
        const saved = saveWalletSettings(nextState, walletStorageOptions);
        setWalletSettings(saved);
        return saved;
    }, [walletStorageOptions]);

    const persistWalletActivity = useCallback((nextState: WalletActivityState): WalletActivityState => {
        const saved = saveWalletActivity(nextState, walletStorageOptions);
        setWalletActivity(saved);
        return saved;
    }, [walletStorageOptions]);

    const executeZapIntent = useCallback(async (
        zapIntent: ZapIntentInput,
        connectionOverride: WalletSettingsState['activeConnection'] = walletSettings.activeConnection,
    ): Promise<ZapExecutionResult> => {
        const actionOwnerScope = currentOwnerScopeRef.current;
        const isCurrentOwnerScope = (): boolean => currentOwnerScopeRef.current === actionOwnerScope;

        if (!connectionOverride) {
            return 'retryable_failure';
        }

        const zapUnavailableMessage = translate(language, 'app.toast.zapUnavailable');
        const paymentFailedMessage = translate(language, 'wallet.toast.paymentFailed');

        if (!input.writeGateway) {
            toast.error(zapUnavailableMessage, { duration: 2200 });
            return 'definitive_failure';
        }

        const profile = input.profiles?.[zapIntent.targetPubkey]
            ?? input.followerProfiles?.[zapIntent.targetPubkey]
            ?? (input.ownerPubkey === zapIntent.targetPubkey ? input.ownerProfile : undefined);
        const writeRelays = [...new Set([
            ...(input.relaySettingsSnapshot?.byType.nip65Both ?? []),
            ...(input.relaySettingsSnapshot?.byType.nip65Write ?? []),
        ])];
        if (writeRelays.length === 0) {
            toast.error(zapUnavailableMessage, { duration: 2200 });
            return 'definitive_failure';
        }

        const activityId = `zap-${zapIntent.eventId ?? zapIntent.targetPubkey}-${Date.now()}`;
        persistWalletActivity(addWalletActivity(loadWalletActivity(walletStorageOptions), {
            id: activityId,
            status: 'pending',
            actionType: 'zap-payment',
            amountMsats: zapIntent.amount * 1000,
            createdAt: Date.now(),
            targetType: zapIntent.eventId ? 'event' : 'profile',
            targetId: zapIntent.eventId ?? zapIntent.targetPubkey,
            provider: connectionOverride.method,
        }));

        try {
            const invoice = zapIntent.eventId
                ? await requestEventZapInvoice({
                    amountSats: zapIntent.amount,
                    eventId: zapIntent.eventId,
                    ...(typeof zapIntent.eventKind === 'number' ? { eventKind: zapIntent.eventKind } : {}),
                    profilePubkey: zapIntent.targetPubkey,
                    profile,
                    relays: writeRelays,
                    writeGateway: input.writeGateway,
                })
                : await requestProfileZapInvoice({
                    amountSats: zapIntent.amount,
                    profilePubkey: zapIntent.targetPubkey,
                    profile,
                    relays: writeRelays,
                    writeGateway: input.writeGateway,
                });

            if (!isCurrentOwnerScope()) {
                return 'retryable_failure';
            }

            try {
                if (connectionOverride.method === 'webln') {
                    const provider = detectWebLnProvider();
                    if (!provider?.sendPayment) {
                        throw new Error('WebLN sendPayment is not available');
                    }
                    await provider.sendPayment(invoice);
                } else {
                    await withNwcClient(connectionOverride, async (client) => {
                        await client.payInvoice(invoice);
                    });
                }

                if (!isCurrentOwnerScope()) {
                    return 'retryable_failure';
                }

                persistWalletActivity(markWalletActivitySucceeded(loadWalletActivity(walletStorageOptions), activityId));
                if (zapIntent.eventId) {
                    input.onRecordOptimisticZap?.({ eventId: zapIntent.eventId, amount: zapIntent.amount });
                }
                toast.success(translate(language, 'wallet.toast.paymentSent'), { duration: 1800 });
                return 'success';
            } catch {
                if (!isCurrentOwnerScope()) {
                    return 'retryable_failure';
                }

                persistWalletActivity(markWalletActivityFailed(loadWalletActivity(walletStorageOptions), activityId, paymentFailedMessage));
                toast.error(paymentFailedMessage, { duration: 2200 });
                return 'retryable_failure';
            }
        } catch {
            if (!isCurrentOwnerScope()) {
                return 'retryable_failure';
            }

            persistWalletActivity(markWalletActivityFailed(loadWalletActivity(walletStorageOptions), activityId, zapUnavailableMessage));
            toast.error(zapUnavailableMessage, { duration: 2200 });
            return 'definitive_failure';
        }
    }, [input.followerProfiles, input.onRecordOptimisticZap, input.ownerProfile, input.ownerPubkey, input.profiles, input.relaySettingsSnapshot?.byType.nip65Both, input.relaySettingsSnapshot?.byType.nip65Write, input.writeGateway, language, persistWalletActivity, walletSettings.activeConnection, walletStorageOptions]);

    const handleZapIntent = useCallback(async (zapIntent: ZapIntentInput): Promise<void> => {
        if (!isZapIntentInput(zapIntent)) {
            return;
        }

        if (!isWalletReadyForPayments(walletSettings.activeConnection)) {
            setPendingZapIntent({
                ...zapIntent,
                ownerScope,
                originPath: `${input.location?.pathname ?? '/'}${input.location?.search ?? ''}`,
                phase: 'navigating',
            });
            input.navigate?.('/wallet');
            return;
        }

        await executeZapIntent(zapIntent);
    }, [executeZapIntent, input.location?.pathname, input.location?.search, input.navigate, ownerScope, walletSettings.activeConnection]);

    const connectWebLnWallet = useCallback(async (options: { silent?: boolean } = {}): Promise<boolean> => {
        const actionOwnerScope = currentOwnerScopeRef.current;
        const provider = detectWebLnProvider();
        if (!provider) {
            if (!options.silent) {
                toast.error(translate(language, 'wallet.toast.weblnUnavailable'), { duration: 2200 });
            }
            return false;
        }

        try {
            await provider.enable?.();
        } catch {
            if (currentOwnerScopeRef.current !== actionOwnerScope) {
                return false;
            }
            if (!options.silent) {
                toast.error(translate(language, 'wallet.toast.weblnReconnectFailed'), { duration: 2200 });
            }
            return false;
        }
        if (currentOwnerScopeRef.current !== actionOwnerScope) {
            return false;
        }

        const capabilities = resolveWebLnCapabilities(provider);
        if (!capabilities.payInvoice) {
            if (!options.silent) {
                toast.error(translate(language, 'wallet.toast.weblnPaymentsUnsupported'), { duration: 2200 });
            }
            return false;
        }

        persistWalletSettings({
            activeConnection: {
                method: 'webln',
                capabilities,
                restoreState: 'connected',
            },
        });
        setWalletNwcUriInput('');
        if (!options.silent) {
            toast.success(translate(language, 'wallet.toast.connected'), { duration: 1800 });
        }
        if (pendingZapIntent?.ownerScope === ownerScope && pendingZapIntent.phase === 'paused' && input.location?.pathname === '/wallet') {
            setPendingZapIntent({ ...pendingZapIntent, phase: 'ready' });
        }
        return true;
    }, [input.location?.pathname, language, ownerScope, pendingZapIntent, persistWalletSettings]);

    const connectNwcWallet = useCallback(async (): Promise<void> => {
        const actionOwnerScope = currentOwnerScopeRef.current;
        try {
            const parsed = parseNwcConnectionUri(walletNwcUriInput);
            const info = await fetchNwcInfo({ createClient: input.createClient, connection: parsed });
            if (currentOwnerScopeRef.current !== actionOwnerScope) {
                return;
            }

            persistWalletSettings({
                activeConnection: {
                    method: 'nwc',
                    uri: parsed.uri,
                    walletServicePubkey: parsed.walletServicePubkey,
                    relays: parsed.relays,
                    secret: parsed.secret,
                    encryption: info.encryption,
                    capabilities: info.capabilities,
                    restoreState: 'connected',
                },
            });
            setWalletNwcUriInput('');
            toast.success(translate(language, 'wallet.toast.connected'), { duration: 1800 });
            if (pendingZapIntent?.ownerScope === ownerScope && pendingZapIntent.phase === 'paused' && input.location?.pathname === '/wallet') {
                setPendingZapIntent({ ...pendingZapIntent, phase: 'ready' });
            }
        } catch (error) {
            if (currentOwnerScopeRef.current !== actionOwnerScope) {
                return;
            }
            const message = error instanceof Error ? error.message : translate(language, 'wallet.toast.nwcConnectFailed');
            toast.error(message, { duration: 2200 });
        }
    }, [input.createClient, input.location?.pathname, language, ownerScope, pendingZapIntent, persistWalletSettings, walletNwcUriInput]);

    const disconnectWallet = useCallback((): void => {
        persistWalletSettings({ activeConnection: null });
        setWalletNwcUriInput('');
    }, [persistWalletSettings]);

    const refreshWallet = useCallback(async (): Promise<void> => {
        const actionOwnerScope = currentOwnerScopeRef.current;
        if (!walletSettings.activeConnection) {
            return;
        }

        if (walletSettings.activeConnection.method === 'webln') {
            const revalidated = await connectWebLnWallet({ silent: true });
            if (currentOwnerScopeRef.current !== actionOwnerScope) {
                return;
            }
            if (!revalidated) {
                const provider = detectWebLnProvider();
                persistWalletSettings({
                    activeConnection: {
                        ...walletSettings.activeConnection,
                        capabilities: resolveWebLnCapabilities(provider),
                        restoreState: 'reconnect-required',
                    },
                });
            }
            return;
        }

        const info = await fetchNwcInfo({ createClient: input.createClient, connection: walletSettings.activeConnection });
        if (currentOwnerScopeRef.current !== actionOwnerScope) {
            return;
        }
        persistWalletSettings({
            activeConnection: {
                ...walletSettings.activeConnection,
                capabilities: info.capabilities,
                encryption: info.encryption,
            },
        });
    }, [connectWebLnWallet, input.createClient, persistWalletSettings, walletSettings.activeConnection]);

    useEffect(() => {
        if (!shouldAutoRestoreRememberedWebLnRef.current) {
            return;
        }

        shouldAutoRestoreRememberedWebLnRef.current = false;
        void connectWebLnWallet({ silent: true });
    }, [connectWebLnWallet, walletStorageOptions]);

    useEffect(() => {
        if (!pendingZapIntent || pendingZapIntent.ownerScope !== ownerScope || input.location?.pathname !== '/wallet' || pendingZapIntent.phase !== 'navigating') {
            return;
        }

        setPendingZapIntent((current) => current ? { ...current, phase: 'ready' } : current);
    }, [input.location?.pathname, ownerScope, pendingZapIntent]);

    useEffect(() => {
        if (!pendingZapIntent || pendingZapIntent.ownerScope !== ownerScope || pendingZapIntent.phase !== 'ready' || !isWalletReadyForPayments(walletSettings.activeConnection) || input.location?.pathname !== '/wallet' || resumingZap) {
            return;
        }

        setResumingZap(true);
        void executeZapIntent(pendingZapIntent)
            .then((result) => {
                if (currentOwnerScopeRef.current !== pendingZapIntent.ownerScope) {
                    return;
                }

                if (result === 'success' || result === 'definitive_failure') {
                    setPendingZapIntent(null);
                } else {
                    setPendingZapIntent((current) => current ? { ...current, phase: 'paused' } : current);
                }

                if (result === 'success') {
                    input.navigate?.(pendingZapIntent.originPath || '/', { replace: true });
                }
            })
            .finally(() => {
                if (currentOwnerScopeRef.current !== pendingZapIntent.ownerScope) {
                    return;
                }

                setResumingZap(false);
            });
    }, [executeZapIntent, input.location?.pathname, input.navigate, ownerScope, pendingZapIntent, resumingZap, walletSettings.activeConnection]);

    useEffect(() => {
        if (!pendingZapIntent || pendingZapIntent.ownerScope !== ownerScope || pendingZapIntent.phase !== 'ready' || input.location?.pathname === '/wallet') {
            return;
        }

        setPendingZapIntent(null);
    }, [input.location?.pathname, ownerScope, pendingZapIntent]);

    return {
        walletSettings,
        walletActivity,
        walletNwcUriInput,
        setWalletNwcUriInput,
        walletStorageOptions,
        handleZapIntent,
        connectWebLnWallet,
        connectNwcWallet,
        disconnectWallet,
        refreshWallet,
    };
}

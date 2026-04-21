import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { saveRelaySettings, type RelaySettingsByType, type RelaySettingsState } from '../../../../nostr/relay-settings';
import { useRelayDetailController } from './useRelayDetailController';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface ControllerHarnessProps {
    ownerPubkey?: string;
    suggestedRelays?: string[];
    suggestedRelaysByType?: Partial<RelaySettingsByType>;
    params: {
        relayUrl: string;
        source: 'configured' | 'suggested';
        relayType: 'nip65Both' | 'nip65Read' | 'nip65Write' | 'dmInbox' | 'search';
    };
}

vi.mock('../../../hooks/useRelayConnectionSummary', () => ({
    useRelayConnectionSummary: () => ({
        statusByRelay: {},
        totalRelays: 0,
        connectedRelays: 0,
        disconnectedRelays: 0,
        checkingRelays: 0,
    }),
}));

vi.mock('../../../query/relay-metadata.query', () => ({
    useRelayMetadataByUrlQuery: () => ({}),
}));

let mounted: RenderResult[] = [];
let latestController: ReturnType<typeof useRelayDetailController> | null = null;

function ControllerHarness(props: ControllerHarnessProps) {
    latestController = useRelayDetailController(props);
    return null;
}

async function renderController(props: ControllerHarnessProps): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(createElement(ControllerHarness, props));
    });

    const rendered = { container, root };
    mounted.push(rendered);
    return rendered;
}

function getController(): ReturnType<typeof useRelayDetailController> {
    if (!latestController) {
        throw new Error('Controller was not rendered');
    }

    return latestController;
}

function seedRelaySettings(state: RelaySettingsState, ownerPubkey?: string): RelaySettingsState {
    return saveRelaySettings(state, ownerPubkey ? { ownerPubkey } : undefined);
}

beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    window.localStorage.clear();
    latestController = null;
});

afterEach(async () => {
    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted = [];
});

describe('useRelayDetailController', () => {
    test('compacts overlapping configured NIP-65 memberships into effective active uses', async () => {
        seedRelaySettings({
            relays: ['wss://relay.bootstrap.example'],
            byType: {
                nip65Both: ['wss://relay.bootstrap.example'],
                nip65Read: ['wss://relay.bootstrap.example'],
                nip65Write: ['wss://relay.bootstrap.example'],
                dmInbox: ['wss://relay.bootstrap.example'],
                search: ['wss://relay.bootstrap.example'],
            },
        });

        await renderController({
            params: {
                relayUrl: 'wss://relay.bootstrap.example',
                source: 'configured',
                relayType: 'nip65Both',
            },
        });

        expect(getController().activeRelayTypes).toEqual(['nip65Both', 'dmInbox', 'search']);
    });

    test('compacts configured read and write overlap into effective nip65Both', async () => {
        seedRelaySettings({
            relays: ['wss://relay.overlap.example'],
            byType: {
                nip65Both: [],
                nip65Read: ['wss://relay.overlap.example'],
                nip65Write: ['wss://relay.overlap.example'],
                dmInbox: ['wss://relay.overlap.example'],
                search: [],
            },
        });

        await renderController({
            params: {
                relayUrl: 'wss://relay.overlap.example',
                source: 'configured',
                relayType: 'nip65Read',
            },
        });

        expect(getController().activeRelayTypes).toEqual(['nip65Both', 'dmInbox']);
    });

    test('keeps suggested relay active uses based on route params', async () => {
        seedRelaySettings({
            relays: ['wss://relay.suggested.example'],
            byType: {
                nip65Both: ['wss://relay.suggested.example'],
                nip65Read: [],
                nip65Write: [],
                dmInbox: ['wss://relay.suggested.example'],
                search: [],
            },
        });

        await renderController({
            suggestedRelaysByType: {
                search: ['wss://relay.suggested.example'],
            },
            params: {
                relayUrl: 'wss://relay.suggested.example',
                source: 'suggested',
                relayType: 'search',
            },
        });

        expect(getController().activeRelayTypes).toEqual(['search']);
    });
});

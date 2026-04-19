import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { Badge } from '@/components/ui/badge';
import { SettingsRelaysPage } from './SettingsRelaysPage';
import type { RelayDetails, RelayInformationDocument, RelayRow } from './types';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: React.ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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

function renderConnectionBadge(label: string) {
    return <Badge variant="outline">{label}</Badge>;
}

function buildRelayRow(overrides: Partial<RelayRow> = {}): RelayRow {
    return {
        relayUrl: 'wss://relay.one',
        relayTypes: ['nip65Both'],
        primaryRelayType: 'nip65Both',
        ...overrides,
    };
}

function buildProps() {
    const relayTypeLabels = {
        nip65Both: 'NIP-65 lectura+escritura',
        nip65Read: 'NIP-65 lectura',
        nip65Write: 'NIP-65 escritura',
        dmInbox: 'NIP-17 buzón DM',
    } as const;

    return {
        configuredRows: [buildRelayRow()],
        suggestedRows: [buildRelayRow({ relayUrl: 'wss://relay.two', relayTypes: ['nip65Read', 'dmInbox'], primaryRelayType: 'nip65Read' })],
        connectedConfiguredRelays: 1,
        disconnectedConfiguredRelays: 0,
        relayInfoByUrl: {} as Record<string, { data?: RelayInformationDocument }>,
        configuredRelayConnectionStatusByRelay: {},
        relayConnectionStatusByRelay: {},
        relayTypeLabels,
        newRelayInput: '',
        newRelayType: 'nip65Both' as const,
        invalidRelayInputs: [],
        onNewRelayInputChange: vi.fn(),
        onNewRelayTypeChange: vi.fn(),
        onAddRelays: vi.fn(),
        onOpenRelayDetails: vi.fn(),
        onRemoveRelay: vi.fn(),
        onAddSuggestedRelay: vi.fn(),
        onAddAllSuggestedRelays: vi.fn(),
        onResetRelaysToDefault: vi.fn(),
        onOpenRelayActionsMenu: vi.fn(),
        describeRelay: vi.fn((relayUrl: string): RelayDetails => ({ relayUrl, source: 'configured', host: relayUrl.replace('wss://', '') })),
        relayAvatarFallback: vi.fn(() => 'RL'),
        relayConnectionBadge: vi.fn(() => renderConnectionBadge('Online')),
    };
}

describe('SettingsRelaysPage', () => {
    test('uses card surfaces for configured table and sidebar panels', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-slot="overlay-page-header"]')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-relay-table-wrap[data-slot="card"]')).not.toBeNull();
        expect(rendered.container.querySelectorAll('.nostr-relays-sidebar-panel[data-slot="card"]').length).toBeGreaterThanOrEqual(2);
        expect(rendered.container.querySelector('.nostr-relays-sidebar .nostr-relay-table-wrap')).not.toBeNull();
        expect(rendered.container.querySelector('button[aria-label="Categoria del relay"]')).not.toBeNull();
    });

    test('renders relay summary counters with badge primitives', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);
        mounted.push(rendered);

        const summary = rendered.container.querySelector('.nostr-relay-connection-summary');
        expect(summary).not.toBeNull();
        expect(summary?.querySelectorAll('[data-slot="badge"]')).toHaveLength(3);
    });
});

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { Badge } from '@/components/ui/badge';
import { SettingsRelayDetailPage } from './SettingsRelayDetailPage';

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

function buildProps() {
    const relayTypeLabels = {
        nip65Both: 'NIP-65 lectura+escritura',
        nip65Read: 'NIP-65 lectura',
        nip65Write: 'NIP-65 escritura',
        dmInbox: 'NIP-17 buzón DM',
        search: 'Búsqueda NIP-50',
    } as const;

    return {
        selectedRelay: {
            relayUrl: 'wss://relay.one',
            source: 'configured' as const,
            relayType: 'nip65Both' as const,
        },
        selectedRelayDetails: {
            relayUrl: 'wss://relay.one',
            source: 'configured' as const,
            host: 'relay.one',
        },
        selectedRelayDocument: {
            name: 'Relay One',
            description: 'Relay principal',
            supported_nips: [1, 17, 65],
        },
        selectedRelayAdminIdentity: 'npub1relayadmin',
        selectedRelayConnectionStatus: undefined,
        relayHasNip11Metadata: true,
        relayHasFees: false,
        copiedRelayIdentityKey: null,
        relayTypeLabels,
        relayAvatarFallback: vi.fn(() => 'RO'),
        relayConnectionBadge: vi.fn(() => <Badge variant="outline">Online</Badge>),
        formatRelayFee: vi.fn(() => '0 sats'),
        onCopyRelayIdentity: vi.fn(async () => {}),
    };
}

describe('SettingsRelayDetailPage', () => {
    test('uses a card surface for the relay detail table', async () => {
        const rendered = await renderElement(<SettingsRelayDetailPage {...buildProps()} />);
        mounted.push(rendered);

        expect(rendered.container.querySelector('[data-testid="overlay-page-header"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="settings-page-body"]')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-relay-detail-table-wrap[data-slot="card"]')).not.toBeNull();
        expect(rendered.container.querySelector('[data-testid="relay-detail-admin-actions"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Detalles del relay');
    });

    test('renders dedicated label for search relay type', async () => {
        const props = buildProps();
        const rendered = await renderElement(<SettingsRelayDetailPage
            {...props}
            selectedRelay={{
                relayUrl: 'wss://search.nos.today',
                source: 'configured',
                relayType: 'search',
            }}
        />);
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Búsqueda NIP-50');
        expect(rendered.container.textContent || '').toContain('Categoria');
    });
});

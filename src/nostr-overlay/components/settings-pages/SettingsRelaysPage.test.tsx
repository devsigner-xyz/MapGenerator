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

async function waitForCondition(check: () => boolean): Promise<void> {
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
        if (check()) {
            return;
        }

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    }

    throw new Error('Condition was not met in time');
}

async function openDropdownTrigger(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
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
        search: 'Búsqueda NIP-50',
    } as const;

    return {
        configuredRows: [buildRelayRow()],
        suggestedRows: [buildRelayRow({ relayUrl: 'wss://relay.two', relayTypes: ['nip65Read', 'dmInbox'], primaryRelayType: 'nip65Read' })],
        searchConfiguredRows: [buildRelayRow({ relayUrl: 'wss://search.nos.today', relayTypes: ['search'], primaryRelayType: 'search' })],
        searchSuggestedRows: [buildRelayRow({ relayUrl: 'wss://relay.noswhere.com', relayTypes: ['search'], primaryRelayType: 'search' })],
        connectedConfiguredRelays: 1,
        disconnectedConfiguredRelays: 0,
        relayInfoByUrl: {} as Record<string, { data?: RelayInformationDocument }>,
        configuredRelayConnectionStatusByRelay: {},
        relayConnectionStatusByRelay: {},
        relayTypeLabels,
        newRelayInput: '',
        newRelayType: 'nip65Both' as const,
        newSearchRelayInput: '',
        invalidRelayInputs: [],
        invalidSearchRelayInputs: [],
        onNewRelayInputChange: vi.fn(),
        onNewRelayTypeChange: vi.fn(),
        onNewSearchRelayInputChange: vi.fn(),
        onAddRelays: vi.fn(),
        onOpenRelayDetails: vi.fn(),
        onRemoveRelay: vi.fn(),
        onAddSuggestedRelay: vi.fn(),
        onAddAllSuggestedRelays: vi.fn(),
        onResetRelaysToDefault: vi.fn(),
        onAddSearchRelays: vi.fn(),
        onRemoveSearchRelay: vi.fn(),
        onAddSuggestedSearchRelay: vi.fn(),
        onAddAllSuggestedSearchRelays: vi.fn(),
        onResetSearchRelaysToDefault: vi.fn(),
        onOpenRelayActionsMenu: vi.fn(),
        describeRelay: vi.fn((relayUrl: string): RelayDetails => ({ relayUrl, source: 'configured', host: relayUrl.replace('wss://', '') })),
        relayAvatarFallback: vi.fn(() => 'RL'),
        relayConnectionBadge: vi.fn(() => renderConnectionBadge('Online')),
    };
}

describe('SettingsRelaysPage', () => {
    test('stacks configured, add relay, and suggested sections without sidebar copy', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        const titleNodes = Array.from(rendered.container.querySelectorAll('[data-slot="card-title"]'));
        const titles = titleNodes.map((node) => node.textContent?.trim());

        expect(rendered.container.querySelector('[data-slot="overlay-page-header"]')).not.toBeNull();
        expect(rendered.container.querySelector('.nostr-relays-sidebar')).toBeNull();
        expect(text).not.toContain('Conecta varios relays. Puedes agregar uno por vez y elegir categoria.');
        expect(rendered.container.querySelector('.nostr-relay-table-card')).not.toBeNull();
        expect(titles.slice(0, 3)).toEqual(['Relays configurados', 'Añadir relay', 'Relays sugeridos']);
        expect(rendered.container.querySelector('button[aria-label="Categoria del relay"]')).not.toBeNull();
    });

    test('renders dedicated scroll wrappers for configured and suggested tables', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);
        mounted.push(rendered);

        expect(rendered.container.querySelectorAll('.nostr-relay-table-scroll')).toHaveLength(4);
    });

    test('renders search relays as a dedicated section in the same page', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);
        mounted.push(rendered);

        const text = rendered.container.textContent || '';
        expect(text).toContain('Relays de búsqueda');
        expect(text).toContain('autocomplete de @');
        expect(text).toContain('búsqueda global de usuarios');
        expect(rendered.container.querySelector('input[aria-label="URLs de relay de búsqueda"]')).not.toBeNull();
        expect(Array.from(rendered.container.querySelectorAll('[data-slot="card-title"]')).map((node) => node.textContent?.trim())).toContain('Relays de búsqueda');
    });

    test('opens relay actions from the ellipsis button using a dropdown menu', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);
        mounted.push(rendered);

        const actionButton = rendered.container.querySelector('button[aria-label^="Abrir acciones para"]') as HTMLButtonElement;
        expect(actionButton).not.toBeNull();

        await openDropdownTrigger(actionButton);
        await waitForCondition(() => Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).some((node) =>
            (node.textContent || '').trim() === 'Detalles'
        ));

        const actions = Array.from(document.body.querySelectorAll('[data-slot="dropdown-menu-item"]')).map((node) =>
            (node.textContent || '').trim()
        );
        expect(actions).toEqual(expect.arrayContaining(['Detalles', 'Eliminar']));
    });

    test('does not render insecure relay icons', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} relayInfoByUrl={{ 'wss://relay.one': { data: { icon: 'http://relay.one/icon.png' } } }} />);
        mounted.push(rendered);

        const insecureIcon = rendered.container.querySelector('img[src="http://relay.one/icon.png"]');
        expect(insecureIcon).toBeNull();
    });

    test('does not render third-party https relay icons from metadata', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} relayInfoByUrl={{ 'wss://relay.one': { data: { icon: 'https://relay.one/icon.png' } } }} />);
        mounted.push(rendered);

        const thirdPartyIcon = rendered.container.querySelector('img[src="https://relay.one/icon.png"]');
        expect(thirdPartyIcon).toBeNull();
    });

    test('renders the add-relay input with url semantics', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);
        mounted.push(rendered);

        const relayInput = rendered.container.querySelector('input[aria-label="URLs de relay"]') as HTMLInputElement;
        expect(relayInput).not.toBeNull();
        expect(relayInput.getAttribute('type')).toBe('url');
        expect(relayInput.getAttribute('inputmode')).toBe('url');
        expect(relayInput.getAttribute('name')).toBe('relayUrls');
        expect(relayInput.getAttribute('autocomplete')).toBe('off');
        expect(relayInput.getAttribute('spellcheck')).toBe('false');
    });

    test('announces invalid relay input state accessibly', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} invalidRelayInputs={['foo']} />);
        mounted.push(rendered);

        const relayInput = rendered.container.querySelector('input[aria-label="URLs de relay"]') as HTMLInputElement;
        const errorMessage = rendered.container.querySelector('#relay-input-error');
        expect(relayInput.getAttribute('aria-invalid')).toBe('true');
        expect(relayInput.getAttribute('aria-describedby')).toBe('relay-input-error');
        expect(errorMessage?.getAttribute('role')).toBe('alert');
    });

    test('renders relay summary counters with badge primitives', async () => {
        const rendered = await renderElement(<SettingsRelaysPage {...buildProps()} />);
        mounted.push(rendered);

        const summary = rendered.container.querySelector('.nostr-relay-connection-summary');
        expect(summary).not.toBeNull();
        expect(summary?.querySelectorAll('[data-slot="badge"]')).toHaveLength(3);
    });
});

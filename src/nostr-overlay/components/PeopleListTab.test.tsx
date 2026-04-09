import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { encodeHexToNpub } from '../../nostr/npub';
import type { NostrProfile } from '../../nostr/types';
import { PeopleListTab } from './PeopleListTab';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return { container, root };
}

function makePubkey(index: number): string {
    return index.toString(16).padStart(64, '0');
}

function makePeople(count: number): string[] {
    return Array.from({ length: count }, (_, index) => makePubkey(index + 1));
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

describe('PeopleListTab', () => {
    test('shows person names, selected style, and emits onSelectPerson', async () => {
        const alice = makePubkey(1);
        const bob = makePubkey(2);
        const onSelectPerson = vi.fn();
        const profiles: Record<string, NostrProfile> = {
            [alice]: { pubkey: alice, displayName: 'Alice' },
            [bob]: { pubkey: bob, displayName: 'Bob' },
        };

        const rendered = await renderElement(
            <PeopleListTab
                people={[alice, bob]}
                profiles={profiles}
                emptyText="No hay personas"
                loading={false}
                selectedPubkey={bob}
                onSelectPerson={onSelectPerson}
            />
        );
        mounted.push(rendered);

        const buttons = Array.from(rendered.container.querySelectorAll('button[aria-pressed]')) as HTMLButtonElement[];
        expect(buttons).toHaveLength(2);
        expect(rendered.container.textContent || '').toContain('Alice');
        expect(rendered.container.textContent || '').toContain('Bob');
        expect(buttons[1].getAttribute('aria-pressed')).toBe('true');

        await act(async () => {
            buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSelectPerson).toHaveBeenCalledTimes(1);
        expect(onSelectPerson).toHaveBeenCalledWith(alice);
    });

    test('shows loading text and supports search input with clear action', async () => {
        const onSearchQueryChange = vi.fn();
        const rendered = await renderElement(
            <PeopleListTab
                people={[]}
                profiles={{}}
                emptyText="Sin resultados"
                loadingText="Cargando..."
                loading
                searchQuery="alice"
                onSearchQueryChange={onSearchQueryChange}
                searchAriaLabel="Buscar en personas"
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Cargando...');
        const input = rendered.container.querySelector('input[aria-label="Buscar en personas"]') as HTMLInputElement;
        expect(input).toBeDefined();

        await act(async () => {
            const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            valueSetter?.call(input, 'alice2');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        const clearButton = rendered.container.querySelector('button[aria-label="Limpiar busqueda"]') as HTMLButtonElement;
        expect(clearButton).toBeDefined();

        await act(async () => {
            clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSearchQueryChange).toHaveBeenCalled();
        expect(onSearchQueryChange).toHaveBeenLastCalledWith('');
    });

    test('shows locate and copy actions for following rows', async () => {
        const alice = makePubkey(1);
        const onSelectPerson = vi.fn();
        const onLocatePerson = vi.fn();
        const onCopyNpub = vi.fn();

        const rendered = await renderElement(
            <PeopleListTab
                people={[alice]}
                profiles={{
                    [alice]: { pubkey: alice, displayName: 'Alice' },
                }}
                emptyText="Sin resultados"
                loading={false}
                onSelectPerson={onSelectPerson}
                onLocatePerson={onLocatePerson}
                onCopyNpub={onCopyNpub}
            />
        );
        mounted.push(rendered);

        const locateButton = rendered.container.querySelector('button[aria-label^="Ubicar "]') as HTMLButtonElement;
        const copyButton = rendered.container.querySelector('button[aria-label^="Copiar npub"]') as HTMLButtonElement;
        expect(locateButton).toBeDefined();
        expect(copyButton).toBeDefined();

        await act(async () => {
            locateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onLocatePerson).toHaveBeenCalledWith(alice);
        expect(onSelectPerson).not.toHaveBeenCalled();

        await act(async () => {
            copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNpub).toHaveBeenCalledTimes(1);
        expect(onSelectPerson).not.toHaveBeenCalled();
        expect((onCopyNpub.mock.calls[0][0] as string).startsWith('npub1')).toBe(true);
    });

    test('shows npub label and nip05 status icon without text in list rows', async () => {
        const alice = makePubkey(1);
        const aliceNpub = encodeHexToNpub(alice);

        const rendered = await renderElement(
            <PeopleListTab
                people={[alice]}
                profiles={{
                    [alice]: { pubkey: alice, displayName: 'Alice', nip05: '_@example.com' },
                }}
                verificationByPubkey={{
                    [alice]: {
                        status: 'verified',
                        identifier: '_@example.com',
                        displayIdentifier: 'example.com',
                        checkedAt: Date.now(),
                    },
                }}
                emptyText="Sin resultados"
                loading={false}
            />
        );
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('Alice');
        expect(content).not.toContain('example.com');
        expect(content).toContain(`${aliceNpub.slice(0, 14)}...${aliceNpub.slice(-6)}`);
        expect(content).not.toContain(`${alice.slice(0, 8)}...${alice.slice(-6)}`);

        const verifiedBadge = rendered.container.querySelector('[aria-label="NIP-05 verificado por DNS: example.com"]') as HTMLElement;
        expect(verifiedBadge).toBeDefined();
        expect(verifiedBadge.getAttribute('title')).toBe('NIP-05 verificado por DNS: example.com');
    });

    test('shows only copy action for followers rows', async () => {
        const bob = makePubkey(2);
        const onCopyNpub = vi.fn();

        const rendered = await renderElement(
            <PeopleListTab
                people={[bob]}
                profiles={{
                    [bob]: { pubkey: bob, displayName: 'Bob' },
                }}
                emptyText="Sin resultados"
                loading={false}
                onCopyNpub={onCopyNpub}
            />
        );
        mounted.push(rendered);

        const locateButton = rendered.container.querySelector('button[aria-label^="Ubicar "]');
        const copyButton = rendered.container.querySelector('button[aria-label^="Copiar npub"]') as HTMLButtonElement;

        expect(locateButton).toBeNull();
        expect(copyButton).toBeDefined();

        await act(async () => {
            copyButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onCopyNpub).toHaveBeenCalledTimes(1);
        expect((onCopyNpub.mock.calls[0][0] as string).startsWith('npub1')).toBe(true);
    });

    test('virtualizes large people lists', async () => {
        const people = makePeople(400);
        const profiles: Record<string, NostrProfile> = {};
        for (const pubkey of people) {
            profiles[pubkey] = { pubkey, displayName: `Person ${pubkey.slice(-4)}` };
        }

        const rendered = await renderElement(
            <div style={{ height: '520px' }}>
                <PeopleListTab
                    people={people}
                    profiles={profiles}
                    emptyText="No hay personas"
                    loading={false}
                />
            </div>
        );
        mounted.push(rendered);

        const renderedItems = rendered.container.querySelectorAll('[data-slot="item"]');
        expect(renderedItems.length).toBeGreaterThan(0);
        expect(renderedItems.length).toBeLessThan(people.length);
    });

    test('loads more people on scroll and shows spinner footer while loading', async () => {
        const people = makePeople(45);
        const profiles: Record<string, NostrProfile> = {};
        for (const pubkey of people) {
            profiles[pubkey] = { pubkey, displayName: `Person ${pubkey.slice(-4)}` };
        }

        const rendered = await renderElement(
            <div style={{ height: '420px' }}>
                <PeopleListTab
                    people={people}
                    profiles={profiles}
                    emptyText="No hay personas"
                    loading={false}
                />
            </div>
        );
        mounted.push(rendered);

        const initialRows = rendered.container.querySelectorAll('[data-slot="item"]');
        expect(initialRows.length).toBeLessThan(people.length);

        const scrollContainer = rendered.container.querySelector('.nostr-people-scroll-area') as HTMLDivElement;
        expect(scrollContainer).toBeDefined();

        Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 220 });
        Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 640 });
        Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 430, writable: true });

        await act(async () => {
            scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        });

        expect(rendered.container.textContent || '').toContain('Cargando mas');

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 200));
        });

        const rowsAfterLoad = rendered.container.querySelectorAll('[data-slot="item"]');
        expect(rowsAfterLoad.length).toBeGreaterThan(initialRows.length);
    });
});

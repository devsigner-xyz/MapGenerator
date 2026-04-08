import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
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

        const buttons = Array.from(rendered.container.querySelectorAll('button.nostr-person')) as HTMLButtonElement[];
        expect(buttons).toHaveLength(2);
        expect(rendered.container.textContent || '').toContain('Alice');
        expect(rendered.container.textContent || '').toContain('Bob');
        expect(buttons[1].classList.contains('nostr-person-active')).toBe(true);

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

        const clearButton = rendered.container.querySelector('button.nostr-search-clear') as HTMLButtonElement;
        expect(clearButton).toBeDefined();

        await act(async () => {
            clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(onSearchQueryChange).toHaveBeenCalled();
        expect(onSearchQueryChange).toHaveBeenLastCalledWith('');
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

        const buttons = rendered.container.querySelectorAll('button.nostr-person');
        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons.length).toBeLessThan(people.length);
    });
});

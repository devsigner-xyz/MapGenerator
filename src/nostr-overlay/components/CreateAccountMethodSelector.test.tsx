import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { CreateAccountMethodSelector } from './CreateAccountMethodSelector';

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

async function renderSelector(): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onSelectMethod = vi.fn();

    await act(async () => {
        root.render(<CreateAccountMethodSelector onSelectMethod={onSelectMethod} />);
    });

    (container as any).__handlers = { onSelectMethod };
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

describe('CreateAccountMethodSelector', () => {
    test('renders the two account creation branches', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const content = rendered.container.textContent || '';
        expect(content).toContain('Usar app o extension');
        expect(content).toContain('Crear cuenta en esta app');
    });

    test('calls back with the selected creation branch', async () => {
        const rendered = await renderSelector();
        mounted.push(rendered);

        const handlers = (rendered.container as any).__handlers;
        const buttons = rendered.container.querySelectorAll('button');
        const localButton = Array.from(buttons).find((button) => (button.textContent || '').includes('Crear cuenta en esta app'));
        expect(localButton).toBeDefined();

        await act(async () => {
            localButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
        });

        expect(handlers.onSelectMethod).toHaveBeenCalledWith('local');
    });
});

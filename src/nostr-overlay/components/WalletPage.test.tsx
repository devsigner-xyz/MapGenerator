import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { WalletPage } from './WalletPage';

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

describe('WalletPage', () => {
    test('renders disconnected empty states with connect actions', async () => {
        const rendered = await renderElement(
            <WalletPage
                walletState={{ activeConnection: null }}
                walletActivity={{ items: [] }}
                nwcUriInput=""
                onNwcUriInputChange={vi.fn()}
                onConnectNwc={vi.fn()}
                onConnectWebLn={vi.fn()}
                onDisconnect={vi.fn()}
                onRefresh={vi.fn()}
                onGenerateInvoice={vi.fn()}
                receiveAmountInput=""
                onReceiveAmountInputChange={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Wallet');
        expect(rendered.container.textContent || '').toContain('Sin wallet conectada');
        expect(rendered.container.querySelector('input[aria-label="URI NWC"]')).not.toBeNull();
        expect(rendered.container.textContent || '').toContain('Conectar con NWC');
        expect(rendered.container.textContent || '').toContain('Conectar con WebLN');
        expect(rendered.container.textContent || '').toContain('Balance no disponible para este metodo');
        expect(rendered.container.textContent || '').toContain('Este metodo no soporta generar invoices');
    });

    test('renders connected wallet details and activity', async () => {
        const rendered = await renderElement(
            <WalletPage
                walletState={{
                    activeConnection: {
                        method: 'webln',
                        capabilities: {
                            payInvoice: true,
                            getBalance: true,
                            makeInvoice: true,
                            notifications: false,
                        },
                        restoreState: 'connected',
                    },
                }}
                walletActivity={{
                    items: [{
                        id: 'zap-1',
                        status: 'succeeded',
                        actionType: 'zap-payment',
                        amountMsats: 21_000,
                        createdAt: 100,
                        targetType: 'profile',
                        targetId: 'f'.repeat(64),
                        provider: 'nwc',
                    }],
                }}
                nwcUriInput="nostr+walletconnect://demo"
                onNwcUriInputChange={vi.fn()}
                onConnectNwc={vi.fn()}
                onConnectWebLn={vi.fn()}
                onDisconnect={vi.fn()}
                onRefresh={vi.fn()}
                onGenerateInvoice={vi.fn()}
                onRequestBalance={vi.fn()}
                balanceDisplay="210 sats"
                receiveAmountInput="21"
                onReceiveAmountInputChange={vi.fn()}
            />
        );
        mounted.push(rendered);

        expect(rendered.container.textContent || '').toContain('Conectada por WebLN');
        expect(rendered.container.textContent || '').toContain('Consultar balance');
        expect(rendered.container.textContent || '').toContain('Generar invoice');
        expect(rendered.container.textContent || '').toContain('Copiar invoice');
        expect(rendered.container.textContent || '').toContain('21 sats');
    });
});

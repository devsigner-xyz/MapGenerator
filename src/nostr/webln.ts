import type { WalletCapabilities } from './wallet-types';

export interface WebLnLikeProvider {
    sendPayment?: (paymentRequest: string) => Promise<unknown>;
    getBalance?: () => Promise<unknown>;
    makeInvoice?: (args: { amount: number }) => Promise<unknown>;
    enable?: () => Promise<void>;
}

declare global {
    interface Window {
        webln?: WebLnLikeProvider;
    }
}

export function detectWebLnProvider(): WebLnLikeProvider | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }

    return window.webln;
}

export function resolveWebLnCapabilities(provider: WebLnLikeProvider | undefined): WalletCapabilities {
    return {
        payInvoice: typeof provider?.sendPayment === 'function',
        getBalance: typeof provider?.getBalance === 'function',
        makeInvoice: typeof provider?.makeInvoice === 'function',
        notifications: false,
    };
}

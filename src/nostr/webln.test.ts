import { describe, expect, test } from 'vitest';
import { detectWebLnProvider, resolveWebLnCapabilities } from './webln';

describe('webln', () => {
    test('returns false capabilities when provider is missing', () => {
        expect(resolveWebLnCapabilities(undefined)).toEqual({
            payInvoice: false,
            getBalance: false,
            makeInvoice: false,
            notifications: false,
        });
        expect(detectWebLnProvider()).toBeUndefined();
    });

    test('maps provider methods to normalized capabilities', () => {
        const provider = {
            sendPayment: async () => ({ preimage: 'abc' }),
            getBalance: async () => ({ balance: '1' }),
            makeInvoice: async () => ({ paymentRequest: 'lnbc1...' }),
        };

        expect(resolveWebLnCapabilities(provider)).toEqual({
            payInvoice: true,
            getBalance: true,
            makeInvoice: true,
            notifications: false,
        });
    });
});

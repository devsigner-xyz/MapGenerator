import { describe, expect, test } from 'vitest';
import { detectWebLnProvider, resolveWebLnCapabilities } from './webln';

describe('webln', () => {
    test('returns false capabilities when provider is missing', () => {
        expect(resolveWebLnCapabilities(undefined)).toEqual({
            payInvoice: false,
            makeInvoice: false,
            notifications: false,
        });
        expect(detectWebLnProvider()).toBeUndefined();
    });

    test('maps provider methods to normalized capabilities', () => {
        const provider = {
            sendPayment: async () => ({ preimage: 'abc' }),
            makeInvoice: async () => ({ paymentRequest: 'lnbc1...' }),
        };

        expect(resolveWebLnCapabilities(provider)).toEqual({
            payInvoice: true,
            makeInvoice: true,
            notifications: false,
        });
    });
});

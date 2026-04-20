import { beforeEach, describe, expect, test } from 'vitest';
import {
    addWalletActivity,
    getDefaultWalletActivityState,
    loadWalletActivity,
    markWalletActivityFailed,
    markWalletActivitySucceeded,
    saveWalletActivity,
} from './wallet-activity';

describe('wallet-activity', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    test('loads empty wallet activity by default', () => {
        expect(loadWalletActivity()).toEqual(getDefaultWalletActivityState());
    });

    test('adds wallet activity newest first and limits the list to 20 items', () => {
        let state = getDefaultWalletActivityState();
        for (let index = 0; index < 25; index += 1) {
            state = addWalletActivity(state, {
                id: `item-${index}`,
                status: 'pending',
                actionType: 'zap-payment',
                amountMsats: (index + 1) * 1000,
                createdAt: index,
                targetType: 'profile',
                targetId: `${index}`,
                provider: 'nwc',
            });
        }

        expect(state.items).toHaveLength(20);
        expect(state.items[0]?.id).toBe('item-24');
        expect(state.items[state.items.length - 1]?.id).toBe('item-5');
    });

    test('updates activity in place when marking success or failure', () => {
        const base = addWalletActivity(getDefaultWalletActivityState(), {
            id: 'receive-1',
            status: 'pending',
            actionType: 'manual-receive',
            amountMsats: 21_000,
            createdAt: 100,
            targetType: 'invoice',
            provider: 'webln',
        });

        const success = markWalletActivitySucceeded(base, 'receive-1', {
            invoice: 'lnbc1test',
            expiresAt: 200,
        });
        expect(success.items[0]).toMatchObject({
            id: 'receive-1',
            status: 'succeeded',
            invoice: 'lnbc1test',
            expiresAt: 200,
        });

        const failed = markWalletActivityFailed(success, 'receive-1', 'failed later');
        expect(failed.items[0]).toMatchObject({
            id: 'receive-1',
            status: 'failed',
            errorMessage: 'failed later',
        });
    });

    test('keeps wallet activity isolated per owner pubkey', () => {
        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);

        const saved = saveWalletActivity(addWalletActivity(getDefaultWalletActivityState(), {
            id: 'zap-1',
            status: 'pending',
            actionType: 'zap-payment',
            amountMsats: 64_000,
            createdAt: 100,
            targetType: 'event',
            targetId: 'e'.repeat(64),
            provider: 'nwc',
        }), { ownerPubkey: ownerA });

        expect(saved.items).toHaveLength(1);
        expect(loadWalletActivity({ ownerPubkey: ownerA }).items).toHaveLength(1);
        expect(loadWalletActivity({ ownerPubkey: ownerB }).items).toHaveLength(0);
    });
});

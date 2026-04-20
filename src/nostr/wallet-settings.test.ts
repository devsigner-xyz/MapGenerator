import { beforeEach, describe, expect, test } from 'vitest';
import {
    WALLET_SETTINGS_STORAGE_KEY,
    getDefaultWalletSettings,
    loadWalletSettings,
    saveWalletSettings,
} from './wallet-settings';

describe('wallet-settings', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    test('loads disconnected defaults when storage is empty', () => {
        expect(loadWalletSettings()).toEqual(getDefaultWalletSettings());
    });

    test('persists nwc wallet settings normalized for the active owner', () => {
        const saved = saveWalletSettings({
            activeConnection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                walletServicePubkey: 'A'.repeat(64),
                relays: ['wss://relay.one.example/', 'wss://relay.one.example'],
                secret: 'B'.repeat(64),
                encryption: 'nip44_v2',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    getBalance: true,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }, { ownerPubkey: 'f'.repeat(64) });

        expect(saved.activeConnection).toMatchObject({
            method: 'nwc',
            walletServicePubkey: 'a'.repeat(64),
            relays: ['wss://relay.one.example'],
            secret: 'b'.repeat(64),
        });
        expect(window.localStorage.getItem(`${WALLET_SETTINGS_STORAGE_KEY}:user:${'f'.repeat(64)}`)).toContain('nip44_v2');
        expect(window.localStorage.getItem(`${WALLET_SETTINGS_STORAGE_KEY}:user:${'f'.repeat(64)}`)).not.toContain('b'.repeat(64));
        expect(loadWalletSettings({ ownerPubkey: 'f'.repeat(64) }).activeConnection).toMatchObject({
            method: 'nwc',
            secret: 'b'.repeat(64),
            restoreState: 'connected',
        });
    });

    test('keeps wallet settings isolated per owner pubkey', () => {
        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);

        saveWalletSettings({
            activeConnection: {
                method: 'webln',
                capabilities: {
                    payInvoice: true,
                    getBalance: false,
                    makeInvoice: true,
                    notifications: false,
                },
                restoreState: 'reconnect-required',
            },
        }, { ownerPubkey: ownerA });

        expect(loadWalletSettings({ ownerPubkey: ownerA }).activeConnection).toMatchObject({ method: 'webln' });
        expect(loadWalletSettings({ ownerPubkey: ownerB })).toEqual(getDefaultWalletSettings());
    });

    test('drops malformed persisted payloads back to defaults', () => {
        window.localStorage.setItem(WALLET_SETTINGS_STORAGE_KEY, '{bad-json');
        expect(loadWalletSettings()).toEqual(getDefaultWalletSettings());
    });

    test('clears session-scoped nwc secret when disconnecting', () => {
        const owner = 'f'.repeat(64);
        saveWalletSettings({
            activeConnection: {
                method: 'nwc',
                uri: `nostr+walletconnect://${'a'.repeat(64)}?relay=wss://relay.one.example&secret=${'b'.repeat(64)}`,
                walletServicePubkey: 'a'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: 'b'.repeat(64),
                encryption: 'nip44_v2',
                restoreState: 'connected',
                capabilities: {
                    payInvoice: true,
                    getBalance: true,
                    makeInvoice: true,
                    notifications: false,
                },
            },
        }, { ownerPubkey: owner });

        saveWalletSettings({ activeConnection: null }, { ownerPubkey: owner });
        expect(loadWalletSettings({ ownerPubkey: owner })).toEqual(getDefaultWalletSettings());
    });

    test('migrates legacy global wallet data once and removes the old global keys', () => {
        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);
        window.localStorage.setItem(WALLET_SETTINGS_STORAGE_KEY, JSON.stringify({
            activeConnection: {
                method: 'nwc',
                uri: '',
                walletServicePubkey: 'c'.repeat(64),
                relays: ['wss://relay.one.example'],
                secret: '',
                encryption: 'nip44_v2',
                restoreState: 'reconnect-required',
                capabilities: {
                    payInvoice: true,
                    getBalance: false,
                    makeInvoice: false,
                    notifications: false,
                },
            },
        }));
        window.sessionStorage.setItem('nostr.overlay.wallet.session.v1', JSON.stringify({
            uri: `nostr+walletconnect://${'c'.repeat(64)}?relay=wss://relay.one.example&secret=${'d'.repeat(64)}`,
            secret: 'd'.repeat(64),
        }));

        expect(loadWalletSettings({ ownerPubkey: ownerA }).activeConnection).toMatchObject({
            method: 'nwc',
            secret: 'd'.repeat(64),
        });
        expect(window.localStorage.getItem(WALLET_SETTINGS_STORAGE_KEY)).toBeNull();
        expect(window.sessionStorage.getItem('nostr.overlay.wallet.session.v1')).toBeNull();
        expect(loadWalletSettings({ ownerPubkey: ownerB })).toEqual(getDefaultWalletSettings());
    });
});

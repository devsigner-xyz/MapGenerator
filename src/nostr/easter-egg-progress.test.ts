import { describe, expect, test } from 'vitest';
import {
    EASTER_EGG_PROGRESS_STORAGE_KEY,
    loadEasterEggProgress,
    markEasterEggDiscovered,
    saveEasterEggProgress,
} from './easter-egg-progress';

describe('easter egg progress storage', () => {
    test('loads defaults when storage is empty', () => {
        const storage = {
            getItem: (): string | null => null,
            setItem: (): void => undefined,
        };

        expect(loadEasterEggProgress({ storage })).toEqual({ discoveredIds: [] });
    });

    test('normalizes and persists discovered ids', () => {
        let persisted = '';
        const storage = {
            getItem: (): string | null => null,
            setItem: (_key: string, value: string) => {
                persisted = value;
            },
        };

        const saved = saveEasterEggProgress({
            discoveredIds: [
                'bitcoin_whitepaper',
                'bitcoin_whitepaper',
                'cyberspace_independence',
            ],
        }, { storage, ownerPubkey: 'f'.repeat(64) });

        expect(saved.discoveredIds).toEqual(['bitcoin_whitepaper', 'cyberspace_independence']);
        expect(JSON.parse(persisted)).toEqual({
            discoveredIds: ['bitcoin_whitepaper', 'cyberspace_independence'],
        });
    });

    test('marks a discovery once and stores under expected key', () => {
        const writes: Array<{ key: string; value: string }> = [];
        const storage = {
            getItem: (): string | null => null,
            setItem: (key: string, value: string) => {
                writes.push({ key, value });
            },
        };

        const next = markEasterEggDiscovered({
            easterEggId: 'crypto_anarchist_manifesto',
            currentState: { discoveredIds: ['bitcoin_whitepaper'] },
            storage,
            ownerPubkey: 'f'.repeat(64),
        });

        expect(next.discoveredIds).toEqual(['bitcoin_whitepaper', 'crypto_anarchist_manifesto']);
        expect(writes[writes.length - 1]?.key).toBe(`${EASTER_EGG_PROGRESS_STORAGE_KEY}:user:${'f'.repeat(64)}`);
    });

    test('migrates legacy progress once to first logged user without leaking to second user', () => {
        const legacyPayload = JSON.stringify({ discoveredIds: ['bitcoin_whitepaper'] });
        const data = new Map<string, string>([
            [EASTER_EGG_PROGRESS_STORAGE_KEY, legacyPayload],
        ]);
        const storage = {
            getItem: (key: string): string | null => data.get(key) ?? null,
            setItem: (key: string, value: string): void => {
                data.set(key, value);
            },
        };

        const ownerA = 'a'.repeat(64);
        const ownerB = 'b'.repeat(64);

        const loadedA = loadEasterEggProgress({ storage, ownerPubkey: ownerA });
        const loadedB = loadEasterEggProgress({ storage, ownerPubkey: ownerB });

        expect(loadedA.discoveredIds).toEqual(['bitcoin_whitepaper']);
        expect(loadedB.discoveredIds).toEqual([]);

        expect(data.get(`${EASTER_EGG_PROGRESS_STORAGE_KEY}:user:${ownerA}`)).toBe(legacyPayload);
        expect(data.get(`${EASTER_EGG_PROGRESS_STORAGE_KEY}:user:${ownerB}`)).toBeUndefined();
    });
});

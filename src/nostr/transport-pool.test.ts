import { describe, expect, test, vi } from 'vitest';
import { createTransportPool } from './transport-pool';

describe('createTransportPool', () => {
    test('returns the same transport for equivalent relay sets', () => {
        const pool = createTransportPool<object>();
        const factory = vi.fn((relays: string[]) => ({ relays }));

        const first = pool.getOrCreate(['wss://relay.one', 'wss://relay.two'], factory);
        const second = pool.getOrCreate(['wss://relay.two/', 'wss://relay.one/'], factory);

        expect(first).toBe(second);
        expect(factory).toHaveBeenCalledTimes(1);
    });
});

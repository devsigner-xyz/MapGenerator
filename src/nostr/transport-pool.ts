import type { DmTransport } from './dm-transport';
import { buildRelaySetKey, normalizeRelaySet } from './relay-runtime';

export interface TransportPool<T> {
    getOrCreate(relays: string[], factory: (relays: string[]) => T): T;
    clear(): void;
}

export function createTransportPool<T>(): TransportPool<T> {
    const transportByRelaySetKey = new Map<string, T>();

    return {
        getOrCreate(relays, factory) {
            const normalizedRelays = normalizeRelaySet(relays);
            const relaySetKey = buildRelaySetKey(normalizedRelays);
            const existing = transportByRelaySetKey.get(relaySetKey);
            if (existing) {
                return existing;
            }

            const created = factory(normalizedRelays);
            transportByRelaySetKey.set(relaySetKey, created);
            return created;
        },

        clear() {
            transportByRelaySetKey.clear();
        },
    };
}

const dmTransportPool = createTransportPool<DmTransport>();

export function getDmTransportPool(): TransportPool<DmTransport> {
    return dmTransportPool;
}

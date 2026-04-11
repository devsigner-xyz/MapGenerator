import { useEffect, useMemo, useState } from 'react';
import { normalizeRelayUrl } from '../../nostr/relay-policy';

export type RelayConnectionStatus = 'checking' | 'connected' | 'disconnected';

export type RelayConnectionProbe = (relayUrl: string, timeoutMs: number) => Promise<boolean>;

interface UseRelayConnectionSummaryOptions {
    enabled?: boolean;
    timeoutMs?: number;
    refreshIntervalMs?: number;
    probe?: RelayConnectionProbe;
}

interface RelayConnectionSummary {
    statusByRelay: Record<string, RelayConnectionStatus>;
    totalRelays: number;
    connectedRelays: number;
    disconnectedRelays: number;
    checkingRelays: number;
}

const DEFAULT_TIMEOUT_MS = 2200;
const DEFAULT_REFRESH_INTERVAL_MS = 45_000;

export async function probeRelayConnection(relayUrl: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<boolean> {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized) {
        return false;
    }

    const isJsdom = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '');
    if (typeof WebSocket === 'undefined' || isJsdom) {
        return false;
    }

    return new Promise<boolean>((resolve) => {
        let settled = false;
        let socket: WebSocket;

        const settle = (connected: boolean): void => {
            if (settled) {
                return;
            }

            settled = true;
            window.clearTimeout(timer);
            if (socket.readyState === WebSocket.OPEN) {
                try {
                    socket.close();
                } catch {
                    // ignore close errors from half-open sockets
                }
            }
            resolve(connected);
        };

        const timer = window.setTimeout(() => {
            settle(false);
        }, timeoutMs);

        try {
            socket = new WebSocket(normalized);
        } catch {
            window.clearTimeout(timer);
            resolve(false);
            return;
        }

        socket.onopen = () => {
            settle(true);
        };

        socket.onerror = () => {
            settle(false);
        };

        socket.onclose = () => {
            settle(false);
        };
    });
}

export function useRelayConnectionSummary(
    relayUrls: string[],
    options: UseRelayConnectionSummaryOptions = {}
): RelayConnectionSummary {
    const enabled = options.enabled ?? true;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
    const probe = options.probe ?? probeRelayConnection;

    const relays = useMemo(
        () => [...new Set(relayUrls.map((relay) => normalizeRelayUrl(relay)).filter((relay): relay is string => Boolean(relay)))],
        [relayUrls]
    );

    const relayKey = useMemo(() => relays.join('|'), [relays]);
    const [statusByRelay, setStatusByRelay] = useState<Record<string, RelayConnectionStatus>>({});

    useEffect(() => {
        setStatusByRelay((current) => {
            const next: Record<string, RelayConnectionStatus> = {};
            for (const relay of relays) {
                next[relay] = current[relay] ?? 'checking';
            }
            return next;
        });
    }, [relayKey, relays]);

    useEffect(() => {
        if (!enabled || relays.length === 0) {
            return;
        }

        let cancelled = false;

        const runProbe = async (): Promise<void> => {
            await Promise.all(
                relays.map(async (relayUrl) => {
                    const connected = await probe(relayUrl, timeoutMs).catch(() => false);
                    if (cancelled) {
                        return;
                    }

                    setStatusByRelay((current) => {
                        const nextStatus: RelayConnectionStatus = connected ? 'connected' : 'disconnected';
                        if (current[relayUrl] === nextStatus) {
                            return current;
                        }

                        return {
                            ...current,
                            [relayUrl]: nextStatus,
                        };
                    });
                })
            );
        };

        void runProbe();

        if (refreshIntervalMs <= 0) {
            return () => {
                cancelled = true;
            };
        }

        const timer = window.setInterval(() => {
            void runProbe();
        }, refreshIntervalMs);

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [enabled, relayKey, relays, probe, timeoutMs, refreshIntervalMs]);

    const connectedRelays = relays.reduce((count, relayUrl) => count + (statusByRelay[relayUrl] === 'connected' ? 1 : 0), 0);
    const checkingRelays = relays.reduce((count, relayUrl) => count + (statusByRelay[relayUrl] === 'checking' ? 1 : 0), 0);
    const totalRelays = relays.length;
    const disconnectedRelays = Math.max(0, totalRelays - connectedRelays - checkingRelays);

    return {
        statusByRelay,
        totalRelays,
        connectedRelays,
        disconnectedRelays,
        checkingRelays,
    };
}

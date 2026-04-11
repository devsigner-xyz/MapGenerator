/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { probeRelayConnection } from './useRelayConnectionSummary';

class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    static instances: MockWebSocket[] = [];

    readonly url: string;
    readyState = MockWebSocket.CONNECTING;
    onopen: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    close = vi.fn(() => {
        this.readyState = MockWebSocket.CLOSED;
    });

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }
}

const originalWebSocket = globalThis.WebSocket;
const originalUserAgent = navigator.userAgent;

describe('probeRelayConnection', () => {
    beforeEach(() => {
        MockWebSocket.instances = [];
        Object.defineProperty(window.navigator, 'userAgent', {
            value: 'Mozilla/5.0',
            configurable: true,
        });
        (globalThis as { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
    });

    afterEach(() => {
        Object.defineProperty(window.navigator, 'userAgent', {
            value: originalUserAgent,
            configurable: true,
        });
        (globalThis as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
    });

    test('does not close a socket that never reached open state', async () => {
        const probe = probeRelayConnection('wss://relay.example', 250);
        const socket = MockWebSocket.instances[0];

        expect(socket).toBeDefined();
        socket.onerror?.(new Event('error'));

        await expect(probe).resolves.toBe(false);
        expect(socket.close).not.toHaveBeenCalled();
    });

    test('closes socket after successful open probe', async () => {
        const probe = probeRelayConnection('wss://relay.example', 250);
        const socket = MockWebSocket.instances[0];

        expect(socket).toBeDefined();
        socket.readyState = MockWebSocket.OPEN;
        socket.onopen?.(new Event('open'));

        await expect(probe).resolves.toBe(true);
        expect(socket.close).toHaveBeenCalledTimes(1);
    });
});

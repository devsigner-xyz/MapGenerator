import { describe, expect, it, vi } from 'vitest';
import { mountNostrOverlayDeferred } from './deferred-bootstrap';

describe('mountNostrOverlayDeferred', () => {
    it('schedules mount on requestIdleCallback when available', async () => {
        const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
            callback({
                didTimeout: false,
                timeRemaining: () => 8,
            } as IdleDeadline);
            return 1;
        });
        const setTimeout = vi.fn();
        const mountNostrOverlay = vi.fn();
        const importOverlayBootstrap = vi.fn(async () => ({ mountNostrOverlay }));

        mountNostrOverlayDeferred({
            scheduler: {
                requestIdleCallback,
                setTimeout,
            },
            importOverlayBootstrap,
        });

        expect(requestIdleCallback).toHaveBeenCalledTimes(1);
        expect(setTimeout).not.toHaveBeenCalled();
        await Promise.resolve();
        expect(importOverlayBootstrap).toHaveBeenCalledTimes(1);
        expect(mountNostrOverlay).toHaveBeenCalledTimes(1);
    });

    it('falls back to setTimeout when requestIdleCallback is not available', async () => {
        const setTimeout = vi.fn((callback: () => void) => {
            callback();
            return 1;
        });
        const mountNostrOverlay = vi.fn();
        const importOverlayBootstrap = vi.fn(async () => ({ mountNostrOverlay }));

        mountNostrOverlayDeferred({
            scheduler: {
                setTimeout,
            },
            importOverlayBootstrap,
        });

        expect(setTimeout).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        expect(importOverlayBootstrap).toHaveBeenCalledTimes(1);
        expect(mountNostrOverlay).toHaveBeenCalledTimes(1);
    });
});

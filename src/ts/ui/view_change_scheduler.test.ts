import { describe, expect, test, vi } from 'vitest';
import { createViewChangeScheduler } from './view_change_scheduler';

interface ScheduledCallback {
    id: number;
    callback: FrameRequestCallback;
}

function createFrameHarness() {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 1;

    return {
        scheduleFrame: (callback: FrameRequestCallback): number => {
            const id = nextId;
            nextId += 1;
            callbacks.set(id, callback);
            return id;
        },
        cancelFrame: (id: number): void => {
            callbacks.delete(id);
        },
        flushFrame: (): void => {
            const scheduled: ScheduledCallback[] = [...callbacks.entries()]
                .map(([id, callback]) => ({ id, callback }))
                .sort((left, right) => left.id - right.id);
            callbacks.clear();
            for (const entry of scheduled) {
                entry.callback(performance.now());
            }
        },
    };
}

describe('createViewChangeScheduler', () => {
    test('coalesces multiple schedule calls in the same frame', () => {
        const frame = createFrameHarness();
        const notify = vi.fn();
        const scheduler = createViewChangeScheduler(notify, frame);

        scheduler.schedule();
        scheduler.schedule();
        scheduler.schedule();

        expect(notify).not.toHaveBeenCalled();
        frame.flushFrame();
        expect(notify).toHaveBeenCalledTimes(1);
    });

    test('allows another notification on a later frame', () => {
        const frame = createFrameHarness();
        const notify = vi.fn();
        const scheduler = createViewChangeScheduler(notify, frame);

        scheduler.schedule();
        frame.flushFrame();
        scheduler.schedule();
        frame.flushFrame();

        expect(notify).toHaveBeenCalledTimes(2);
    });

    test('dispose cancels pending callback', () => {
        const frame = createFrameHarness();
        const notify = vi.fn();
        const scheduler = createViewChangeScheduler(notify, frame);

        scheduler.schedule();
        scheduler.dispose();
        frame.flushFrame();

        expect(notify).not.toHaveBeenCalled();
    });
});

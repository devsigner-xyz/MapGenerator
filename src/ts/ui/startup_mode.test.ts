import { describe, expect, test, vi } from 'vitest';
import { applyMapFirstStartup, shouldShowTensorField } from './startup_mode';

describe('startup map mode', () => {
    test('applyMapFirstStartup closes tensor folder before generating map', async () => {
        const events: string[] = [];
        const closeTensorFolder = vi.fn(() => {
            events.push('close');
        });
        const generateMap = vi.fn(async () => {
            events.push('generate');
        });

        await applyMapFirstStartup({
            closeTensorFolder,
            generateMap,
        });

        expect(closeTensorFolder).toHaveBeenCalledTimes(1);
        expect(generateMap).toHaveBeenCalledTimes(1);
        expect(events).toEqual(['close', 'generate']);
    });

    test('shouldShowTensorField only depends on tensor folder state', () => {
        expect(shouldShowTensorField(true)).toBe(false);
        expect(shouldShowTensorField(false)).toBe(true);
    });
});

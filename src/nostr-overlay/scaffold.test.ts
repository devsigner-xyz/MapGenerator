import { describe, expect, test } from 'vitest';

describe('overlay scaffold', () => {
    test('react overlay module is loadable', { timeout: 30_000 }, async () => {
        const mod = await import('./App');
        expect(mod).toBeDefined();
    });
});

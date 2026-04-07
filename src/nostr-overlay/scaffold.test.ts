import { describe, expect, test } from 'vitest';

describe('overlay scaffold', () => {
    test('react overlay module is loadable', async () => {
        const mod = await import('./App');
        expect(mod).toBeDefined();
    });
});

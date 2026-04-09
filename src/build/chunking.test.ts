import { describe, expect, it } from 'vitest';
import { resolveManualChunk } from './chunking';

describe('resolveManualChunk', () => {
    it('groups Nostr dependencies in nostr chunk', () => {
        expect(resolveManualChunk('/node_modules/@nostr-dev-kit/ndk/dist/index.js')).toBe('nostr');
    });

    it('groups heavy Three/STL dependencies in three-stl chunk', () => {
        expect(resolveManualChunk('/node_modules/three/build/three.module.js')).toBe('three-stl');
        expect(resolveManualChunk('/node_modules/threejs-export-stl/index.js')).toBe('three-stl');
        expect(resolveManualChunk('/node_modules/three-csg-ts/index.js')).toBe('three-stl');
    });

    it('groups overlay app code into overlay chunk', () => {
        expect(resolveManualChunk('/src/nostr-overlay/App.tsx')).toBe('overlay');
    });

    it('returns undefined for ids that should stay in default chunking', () => {
        expect(resolveManualChunk('/src/ts/ui/main_gui.ts')).toBeUndefined();
    });
});

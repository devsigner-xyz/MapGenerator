declare module '*.css';
declare module 'roughjs/bundled/rough.esm.js';

declare module 'three/addons/exporters/STLExporter.js' {
    import type { Object3D } from 'three';

    export class STLExporter {
        parse(scene: Object3D, options?: { binary?: boolean }): string | DataView;
    }
}

declare module 'three/addons/utils/BufferGeometryUtils.js' {
    import type { BufferGeometry } from 'three';

    export function mergeGeometries(geometries: BufferGeometry[], useGroups?: boolean): BufferGeometry | null;
}

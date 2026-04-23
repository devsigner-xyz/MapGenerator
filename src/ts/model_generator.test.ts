import * as THREE from 'three';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import ModelGenerator from './model_generator';
import Vector from './vector';
import type { BuildingModel } from './ui/buildings';

const EMPTY_STL = 'solid exported\nendsolid exported\n';

function createSquare(size = 10, offsetX = 0, offsetY = 0): Vector[] {
    return [
        new Vector(offsetX, offsetY),
        new Vector(offsetX + size, offsetY),
        new Vector(offsetX + size, offsetY + size),
        new Vector(offsetX, offsetY + size),
    ];
}

function createBuildingModel(): BuildingModel {
    const lotScreen = createSquare(4, 2, 2);

    return {
        lotIndex: 0,
        height: 8,
        lotWorld: lotScreen.map((point) => point.clone()),
        lotScreen,
        roof: lotScreen.map((point) => point.clone()),
        sides: [],
    };
}

function createDegeneratePolygon(): Vector[] {
    return [
        new Vector(0, 0),
        new Vector(1, 0),
        new Vector(2, 0),
    ];
}

function createDegenerateBuildingModel(): BuildingModel {
    const lotScreen = createDegeneratePolygon();

    return {
        lotIndex: 1,
        height: 8,
        lotWorld: lotScreen.map((point) => point.clone()),
        lotScreen,
        roof: lotScreen.map((point) => point.clone()),
        sides: [],
    };
}

async function exportModelZip(): Promise<JSZip> {
    const generator = new ModelGenerator(
        createSquare(20),
        createSquare(6, 1, 1),
        createSquare(8, 2, 2),
        createSquare(3, 5, 5),
        [createSquare(2, 1, 10)],
        [createSquare(2, 4, 10)],
        [createSquare(2, 7, 10)],
        [createBuildingModel()],
        [createSquare(5, 10, 2)],
    );

    const blobPromise = generator.getSTL();

    for (let i = 0; i < 20; i++) {
        const processing = generator.update();
        if (!processing) {
            break;
        }
    }

    const blob = await blobPromise;
    return JSZip.loadAsync(await blob.arrayBuffer());
}

async function exportSparseModelZip(): Promise<JSZip> {
    const generator = new ModelGenerator(
        createSquare(20),
        [new Vector(0, 0), new Vector(1, 0)],
        [new Vector(0, 0), new Vector(1, 0)],
        [new Vector(0, 0), new Vector(1, 0)],
        [],
        [],
        [],
        [],
        [],
    );

    const blobPromise = generator.getSTL();

    for (let i = 0; i < 20; i++) {
        const processing = generator.update();
        if (!processing) {
            break;
        }
    }

    const blob = await blobPromise;
    return JSZip.loadAsync(await blob.arrayBuffer());
}

describe('ModelGenerator', () => {
    it('exports the STL zip with the expected model files', async () => {
        const zip = await exportModelZip();

        expect(Object.keys(zip.files).sort()).toEqual([
            'model/',
            'model/README.txt',
            'model/blocks.stl',
            'model/buildings.stl',
            'model/coastline.stl',
            'model/domain.stl',
            'model/river.stl',
            'model/roads.stl',
            'model/sea.stl',
        ]);

        await expect(zip.file('model/domain.stl')?.async('string')).resolves.toContain('solid');
        await expect(zip.file('model/buildings.stl')?.async('string')).resolves.toContain('solid');
    });

    it('exports empty STL files when optional layers are empty or degenerate', async () => {
        const zip = await exportSparseModelZip();

        await expect(zip.file('model/sea.stl')?.async('string')).resolves.toContain('solid');
        await expect(zip.file('model/roads.stl')?.async('string')).resolves.toContain('solid');
        await expect(zip.file('model/buildings.stl')?.async('string')).resolves.toContain('solid');
    });

    it('keeps valid merged geometry when a layer mixes valid and degenerate polygons', async () => {
        const generator = new ModelGenerator(
            createSquare(20),
            createSquare(6, 1, 1),
            createSquare(8, 2, 2),
            createSquare(3, 5, 5),
            [createSquare(2, 1, 10), [new Vector(0, 0), new Vector(1, 0)]],
            [],
            [],
            [],
            [],
        );

        const blobPromise = generator.getSTL();

        for (let i = 0; i < 20; i++) {
            const processing = generator.update();
            if (!processing) {
                break;
            }
        }

        const zip = await JSZip.loadAsync(await (await blobPromise).arrayBuffer());
        await expect(zip.file('model/roads.stl')?.async('string')).resolves.not.toBe(EMPTY_STL);
    });

    it('exports an empty STL for zero-area building polygons', async () => {
        const generator = new ModelGenerator(
            createSquare(20),
            createSquare(6, 1, 1),
            createSquare(8, 2, 2),
            createSquare(3, 5, 5),
            [],
            [],
            [],
            [createDegenerateBuildingModel()],
            [],
        );

        const blobPromise = generator.getSTL();

        for (let i = 0; i < 20; i++) {
            const processing = generator.update();
            if (!processing) {
                break;
            }
        }

        const zip = await JSZip.loadAsync(await (await blobPromise).arrayBuffer());
        await expect(zip.file('model/buildings.stl')?.async('string')).resolves.toBe(EMPTY_STL);
    });

    it('returns BufferGeometry even when a polygon is too short to extrude', () => {
        const generator = new ModelGenerator([], [], [], [], [], [], [], [], []);

        const mesh = (generator as unknown as { polygonToMesh: (polygon: Vector[], height: number) => THREE.Mesh }).polygonToMesh([
            new Vector(0, 0),
            new Vector(1, 0),
        ], 1);

        expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
    });
});

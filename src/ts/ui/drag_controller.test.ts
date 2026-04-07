import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import DomainController from './domain_controller';
import DragController from './drag_controller';
import Util from '../util';

vi.mock('interactjs', () => ({
    default: vi.fn(() => ({
        draggable: vi.fn(),
    })),
}));

describe('DragController pan mode', () => {
    beforeEach(() => {
        const canvas = document.createElement('canvas');
        canvas.id = Util.CANVAS_ID;
        document.body.appendChild(canvas);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    test('does not pan map when drag is disabled and pan mode is inactive', () => {
        const dragController = new DragController({} as dat.GUI);
        const domainController = DomainController.getInstance();
        const panSpy = vi.spyOn(domainController, 'pan');

        dragController.setDragDisabled(true);
        dragController.setPanModeEnabled(false);
        dragController.dragMove({ delta: { x: 10, y: 8 } });

        expect(panSpy).not.toHaveBeenCalled();
    });

    test('pans map when drag is disabled and pan mode is active', () => {
        const dragController = new DragController({} as dat.GUI);
        const domainController = DomainController.getInstance();
        const panSpy = vi.spyOn(domainController, 'pan');

        dragController.setDragDisabled(true);
        dragController.setPanModeEnabled(true);
        dragController.dragMove({ delta: { x: 12, y: 6 } });

        expect(panSpy).toHaveBeenCalledTimes(1);
    });

    test('updates canvas cursor for click mode and pan mode', () => {
        const canvas = document.getElementById(Util.CANVAS_ID) as HTMLCanvasElement;
        const dragController = new DragController({} as dat.GUI);

        dragController.setDragDisabled(true);
        dragController.setPanModeEnabled(false);
        expect(canvas.style.cursor).toBe('pointer');

        dragController.setPanModeEnabled(true);
        expect(canvas.style.cursor).toBe('grab');
    });
});

import { describe, expect, test } from 'vitest';
import { DefaultCanvasWrapper } from './canvas_wrapper';

describe('DefaultCanvasWrapper dimensions', () => {
    test('uses canvas client size instead of window size', () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 960,
        });
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: 960,
        });

        const canvas = document.createElement('canvas');
        Object.defineProperty(canvas, 'getContext', {
            configurable: true,
            value: () => ({
                fillStyle: '',
                fillRect: () => {},
            }),
        });
        Object.defineProperty(canvas, 'clientWidth', {
            configurable: true,
            value: 580,
        });
        Object.defineProperty(canvas, 'clientHeight', {
            configurable: true,
            value: 960,
        });

        const wrapper = new DefaultCanvasWrapper(canvas, 1, false);

        expect(wrapper.width).toBe(580);
        expect(wrapper.height).toBe(960);
        expect(canvas.width).toBe(580);
    });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { EasterEggFireworks } from './EasterEggFireworks';

const { createFireworksMock, stopFireworksMock } = vi.hoisted(() => ({
    createFireworksMock: vi.fn(),
    stopFireworksMock: vi.fn(),
}));

vi.mock('@tsparticles/fireworks', () => ({
    fireworks: {
        create: createFireworksMock,
    },
}));

interface RenderResult {
    container: HTMLDivElement;
    root: Root;
}

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

const mounted: RenderResult[] = [];

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();

    for (const entry of mounted) {
        await act(async () => {
            entry.root.unmount();
        });
        entry.container.remove();
    }
    mounted.length = 0;
    createFireworksMock.mockReset();
    stopFireworksMock.mockReset();
});

async function renderElement(element: ReactElement): Promise<RenderResult> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    const result = { container, root };
    mounted.push(result);
    return result;
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });

    return { promise, resolve };
}

function mockReducedMotionPreference(matches: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: vi.fn().mockReturnValue({
            matches,
            media: '(prefers-reduced-motion: reduce)',
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }),
    });
}

describe('EasterEggFireworks', () => {
    test('renders fireworks outside the overlay root stacking context', async () => {
        createFireworksMock.mockResolvedValue({ stop: stopFireworksMock });
        mockReducedMotionPreference(false);

        const rendered = await renderElement(<EasterEggFireworks nonce={1} />);

        expect(rendered.container.querySelector('.nostr-easter-egg-fireworks')).toBeNull();
        expect(document.body.querySelector('.nostr-easter-egg-fireworks')).not.toBeNull();
    });

    test('starts fireworks for a positive celebration nonce and cleans them up', async () => {
        vi.useFakeTimers();
        createFireworksMock.mockResolvedValue({ stop: stopFireworksMock });
        mockReducedMotionPreference(false);

        await renderElement(<EasterEggFireworks nonce={1} />);

        await act(async () => {
            await Promise.resolve();
        });

        const host = document.body.querySelector('.nostr-easter-egg-fireworks') as HTMLElement;
        expect(host).not.toBeNull();
        expect(host.tagName).toBe('DIV');
        expect(createFireworksMock).toHaveBeenCalledWith(host, expect.objectContaining({
            background: 'transparent',
            sounds: false,
        }));

        await act(async () => {
            vi.advanceTimersByTime(4999);
        });

        expect(stopFireworksMock).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1);
        });

        expect(stopFireworksMock).toHaveBeenCalledTimes(1);
    });

    test('places the fireworks canvas above modal dialogs', () => {
        const styles = readFileSync(join(process.cwd(), 'src', 'nostr-overlay', 'styles.css'), 'utf8');

        expect(styles).toMatch(/\.nostr-easter-egg-fireworks\s*\{[^}]*z-index:\s*2147483647\s*!important/s);
    });

    test('keeps the tsParticles-managed canvas inside a top-layer wrapper', async () => {
        createFireworksMock.mockImplementation((host: HTMLElement) => {
            const canvas = document.createElement('canvas');
            canvas.style.setProperty('z-index', '0', 'important');
            canvas.style.setProperty('pointer-events', 'auto', 'important');
            host.appendChild(canvas);

            return Promise.resolve({ stop: stopFireworksMock });
        });
        mockReducedMotionPreference(false);

        await renderElement(<EasterEggFireworks nonce={1} />);

        await act(async () => {
            await Promise.resolve();
        });

        const host = document.body.querySelector('.nostr-easter-egg-fireworks') as HTMLElement;
        const canvas = host.querySelector('canvas') as HTMLCanvasElement;
        expect(host.tagName).toBe('DIV');
        expect(host.style.getPropertyValue('z-index')).toBe('2147483647');
        expect(host.style.getPropertyPriority('z-index')).toBe('important');
        expect(host.style.getPropertyValue('pointer-events')).toBe('none');
        expect(host.style.getPropertyPriority('pointer-events')).toBe('important');
        expect(canvas.style.getPropertyValue('z-index')).toBe('0');
        expect(canvas.style.getPropertyPriority('z-index')).toBe('important');
    });

    test('does not load fireworks when reduced motion is preferred', async () => {
        mockReducedMotionPreference(true);

        await renderElement(<EasterEggFireworks nonce={1} />);

        await act(async () => {
            await Promise.resolve();
        });

        expect(createFireworksMock).not.toHaveBeenCalled();
    });

    test('stops fireworks when creation finishes after the display duration', async () => {
        vi.useFakeTimers();
        const deferredFireworks = createDeferred<{ stop: () => void }>();
        createFireworksMock.mockReturnValue(deferredFireworks.promise);
        mockReducedMotionPreference(false);

        await renderElement(<EasterEggFireworks nonce={1} durationMs={100} />);

        await act(async () => {
            await Promise.resolve();
            vi.advanceTimersByTime(100);
        });

        expect(stopFireworksMock).not.toHaveBeenCalled();

        await act(async () => {
            deferredFireworks.resolve({ stop: stopFireworksMock });
            await Promise.resolve();
        });

        expect(stopFireworksMock).toHaveBeenCalledTimes(1);
    });
});

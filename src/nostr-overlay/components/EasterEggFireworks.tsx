import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface EasterEggFireworksProps {
    nonce: number;
    durationMs?: number;
}

interface FireworksController {
    destroy?: () => Promise<void> | void;
    stop?: () => Promise<void> | void;
}

const TOP_LAYER_Z_INDEX = '2147483647';

function stopFireworks(controller: FireworksController): void {
    const stop = controller.destroy ?? controller.stop;
    if (stop) {
        void Promise.resolve(stop.call(controller));
    }
}

function applyTopLayerHostStyles(host: HTMLElement): void {
    const style = host.style;

    if (style.getPropertyValue('position') !== 'fixed' || style.getPropertyPriority('position') !== 'important') {
        style.setProperty('position', 'fixed', 'important');
    }
    if (style.getPropertyValue('inset') !== '0px' || style.getPropertyPriority('inset') !== 'important') {
        style.setProperty('inset', '0', 'important');
    }
    if (style.getPropertyValue('width') !== '100vw' || style.getPropertyPriority('width') !== 'important') {
        style.setProperty('width', '100vw', 'important');
    }
    if (style.getPropertyValue('height') !== '100vh' || style.getPropertyPriority('height') !== 'important') {
        style.setProperty('height', '100vh', 'important');
    }
    if (style.getPropertyValue('z-index') !== TOP_LAYER_Z_INDEX || style.getPropertyPriority('z-index') !== 'important') {
        style.setProperty('z-index', TOP_LAYER_Z_INDEX, 'important');
    }
    if (style.getPropertyValue('pointer-events') !== 'none' || style.getPropertyPriority('pointer-events') !== 'important') {
        style.setProperty('pointer-events', 'none', 'important');
    }
}

export function EasterEggFireworks({ nonce, durationMs = 5000 }: EasterEggFireworksProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (nonce <= 0 || !container) {
            return;
        }

        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        applyTopLayerHostStyles(container);

        let controller: FireworksController | undefined;
        let didStop = false;
        let didCancel = false;
        let didTimeout = false;

        const stopCurrentFireworks = (): void => {
            if (!controller || didStop) {
                return;
            }

            didStop = true;
            stopFireworks(controller);
        };

        const timeoutId = window.setTimeout(() => {
            didTimeout = true;
            stopCurrentFireworks();
        }, durationMs);

        void import('@tsparticles/fireworks')
            .then(({ fireworks }) => fireworks.create(container as unknown as HTMLCanvasElement, {
                background: 'transparent',
                colors: ['#f8fafc', '#facc15', '#f97316', '#38bdf8', '#a78bfa'],
                sounds: false,
            }))
            .then((instance) => {
                controller = instance as FireworksController;
                applyTopLayerHostStyles(container);
                if (didCancel || didTimeout) {
                    stopCurrentFireworks();
                }
            })
            .catch(() => undefined);

        return () => {
            didCancel = true;
            window.clearTimeout(timeoutId);
            stopCurrentFireworks();
        };
    }, [durationMs, nonce]);

    if (nonce <= 0) {
        return null;
    }

    return createPortal(
        <div ref={containerRef} id="nostr-easter-egg-fireworks" className="nostr-easter-egg-fireworks" aria-hidden="true" />,
        document.body,
    );
}

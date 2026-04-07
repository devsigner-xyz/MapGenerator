import { useEffect, useState } from 'react';
import type { MapBridge } from '../map-bridge';

interface MapZoomControlsProps {
    mapBridge: MapBridge | null;
}

function clampZoom(value: number): number {
    return Math.max(0.3, Math.min(20, value));
}

function dispatchMapWheel(deltaY: number): void {
    const canvas = document.getElementById('map-canvas');
    if (!canvas) {
        return;
    }

    const event = typeof WheelEvent === 'function'
        ? new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY,
        })
        : new Event('wheel', {
            bubbles: true,
            cancelable: true,
        });
    canvas.dispatchEvent(event);
}

export function MapZoomControls({ mapBridge }: MapZoomControlsProps) {
    const [zoom, setZoom] = useState(1);

    useEffect(() => {
        if (!mapBridge) {
            setZoom(1);
            return;
        }

        const refresh = (): void => {
            setZoom(clampZoom(mapBridge.getZoom()));
        };

        refresh();
        return mapBridge.onViewChanged(refresh);
    }, [mapBridge]);

    const onZoomIn = (): void => {
        const targetZoom = clampZoom(zoom + 1);
        setZoom(targetZoom);
        if (mapBridge?.setZoom) {
            mapBridge.setZoom(targetZoom);
            return;
        }

        dispatchMapWheel(-100);
    };

    const onZoomOut = (): void => {
        const targetZoom = clampZoom(zoom - 1);
        setZoom(targetZoom);
        if (mapBridge?.setZoom) {
            mapBridge.setZoom(targetZoom);
            return;
        }

        dispatchMapWheel(100);
    };

    return (
        <div className="nostr-map-zoom-controls" aria-label="Controles de zoom">
            <button type="button" className="nostr-map-zoom-button" aria-label="Acercar mapa" onClick={onZoomIn}>
                +
            </button>

            <p className="nostr-map-zoom-level" aria-live="polite">{`${zoom.toFixed(2)}x`}</p>

            <button type="button" className="nostr-map-zoom-button" aria-label="Alejar mapa" onClick={onZoomOut}>
                -
            </button>
        </div>
    );
}

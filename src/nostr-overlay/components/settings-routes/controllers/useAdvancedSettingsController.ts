import { useEffect, useRef, type RefObject } from 'react';
import type { MapBridge } from '../../../map-bridge';

interface UseAdvancedSettingsControllerInput {
    mapBridge: MapBridge | null;
}

interface AdvancedSettingsController {
    settingsHostRef: RefObject<HTMLDivElement | null>;
}

export function useAdvancedSettingsController(input: UseAdvancedSettingsControllerInput): AdvancedSettingsController {
    const settingsHostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const mapBridge = input.mapBridge;
        const host = settingsHostRef.current;
        if (!mapBridge || !host) {
            return;
        }

        mapBridge.mountSettingsPanel(host);
        return () => {
            mapBridge.mountSettingsPanel(null);
        };
    }, [input.mapBridge]);

    return {
        settingsHostRef,
    };
}

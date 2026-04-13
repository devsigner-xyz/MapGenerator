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
        if (!input.mapBridge || !settingsHostRef.current) {
            return;
        }

        input.mapBridge.mountSettingsPanel(settingsHostRef.current);
        return () => {
            input.mapBridge.mountSettingsPanel(null);
        };
    }, [input.mapBridge]);

    return {
        settingsHostRef,
    };
}

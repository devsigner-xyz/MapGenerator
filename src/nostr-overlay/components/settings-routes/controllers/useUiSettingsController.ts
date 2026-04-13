import { useState } from 'react';
import { loadUiSettings, saveUiSettings, type UiSettingsState } from '../../../../nostr/ui-settings';

interface UseUiSettingsControllerInput {
    onUiSettingsChange?: (nextState: UiSettingsState) => void;
}

interface UiSettingsController {
    uiSettings: UiSettingsState;
    persistUiSettings: (nextState: UiSettingsState) => void;
}

export function useUiSettingsController(input: UseUiSettingsControllerInput): UiSettingsController {
    const [uiSettings, setUiSettings] = useState<UiSettingsState>(() => loadUiSettings());

    const persistUiSettings = (nextState: UiSettingsState): void => {
        const savedState = saveUiSettings(nextState);
        setUiSettings(savedState);
        input.onUiSettingsChange?.(savedState);
    };

    return {
        uiSettings,
        persistUiSettings,
    };
}

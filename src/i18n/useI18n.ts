import { useContext, useMemo, useSyncExternalStore } from 'react';
import { loadUiSettings, UI_SETTINGS_LANGUAGE_CHANGE_EVENT } from '../nostr/ui-settings';
import { I18nContext, type I18nContextValue } from './I18nProvider';
import { translate } from './translate';

function subscribeToLocaleChanges(onStoreChange: () => void): () => void {
    if (typeof window === 'undefined') {
        return () => {};
    }

    const handleChange = (): void => {
        onStoreChange();
    };

    window.addEventListener('storage', handleChange);
    window.addEventListener(UI_SETTINGS_LANGUAGE_CHANGE_EVENT, handleChange);

    return (): void => {
        window.removeEventListener('storage', handleChange);
        window.removeEventListener(UI_SETTINGS_LANGUAGE_CHANGE_EVENT, handleChange);
    };
}

function getStoredLocale() {
    return loadUiSettings().language;
}

export function useI18n(): I18nContextValue {
    const context = useContext(I18nContext);
    const fallbackLocale = useSyncExternalStore(subscribeToLocaleChanges, getStoredLocale, getStoredLocale);

    return useMemo<I18nContextValue>(() => {
        if (context) {
            return context;
        }

        return {
            locale: fallbackLocale,
            setLocale: () => {},
            t: (key, params) => translate(fallbackLocale, key, params),
        };
    }, [context, fallbackLocale]);
}

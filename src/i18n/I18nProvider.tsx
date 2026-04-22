import { createContext, useMemo, useState, type PropsWithChildren } from 'react';
import { translate } from './translate';
import type { AppLocale, MessageParams } from './types';
import type { AppMessageKey } from './catalog';

export interface I18nContextValue {
    locale: AppLocale;
    setLocale: (locale: AppLocale) => void;
    t: (key: AppMessageKey, params?: MessageParams) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps extends PropsWithChildren {
    initialLocale: AppLocale;
}

export function I18nProvider({ initialLocale, children }: I18nProviderProps) {
    const [locale, setLocale] = useState<AppLocale>(initialLocale);

    const value = useMemo<I18nContextValue>(() => ({
        locale,
        setLocale,
        t: (key, params) => translate(locale, key, params),
    }), [locale]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

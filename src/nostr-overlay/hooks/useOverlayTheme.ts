import { useEffect, useMemo, useState } from 'react';
import type { UiTheme } from '../../nostr/ui-settings';

export type ResolvedOverlayTheme = 'light' | 'dark';

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

function readSystemTheme(): ResolvedOverlayTheme {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return 'light';
    }

    return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light';
}

export function useOverlayTheme(theme: UiTheme): ResolvedOverlayTheme {
    const [systemTheme, setSystemTheme] = useState<ResolvedOverlayTheme>(() => readSystemTheme());

    useEffect(() => {
        if (theme !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }

        const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
        const syncTheme = (): void => {
            setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
        };

        syncTheme();

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', syncTheme);
            return () => {
                mediaQuery.removeEventListener('change', syncTheme);
            };
        }

        mediaQuery.addListener(syncTheme);
        return () => {
            mediaQuery.removeListener(syncTheme);
        };
    }, [theme]);

    const resolvedTheme = useMemo<ResolvedOverlayTheme>(() => {
        if (theme === 'system') {
            return systemTheme;
        }

        return theme;
    }, [systemTheme, theme]);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }

        document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
        document.documentElement.style.colorScheme = resolvedTheme;
    }, [resolvedTheme]);

    return resolvedTheme;
}

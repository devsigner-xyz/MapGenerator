import { useEffect, useMemo, useState } from 'react';
import type { UiTheme } from '../../nostr/ui-settings';

export type ResolvedOverlayTheme = 'light' | 'dark';

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';
const FAVICON_BY_THEME: Record<ResolvedOverlayTheme, string> = {
    light: '/icon-light-32x32.png',
    dark: '/icon-dark-32x32.png',
};

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

        const iconHref = FAVICON_BY_THEME[resolvedTheme];
        const iconLink = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement('link');
        iconLink.rel = 'icon';
        iconLink.type = 'image/png';
        iconLink.href = iconHref;
        if (!iconLink.parentElement) {
            document.head.appendChild(iconLink);
        }
    }, [resolvedTheme]);

    return resolvedTheme;
}

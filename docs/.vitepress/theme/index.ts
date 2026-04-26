import type { Theme } from 'vitepress';
import { useData } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import { onMounted, onUnmounted, watch } from 'vue';
import { UI_SETTINGS_STORAGE_KEY } from '../../../src/nostr/ui-settings';
import {
  SITE_THEME_CHANGE_EVENT,
  readSiteThemePreference,
  readStoredSiteThemeValue,
  resolveSiteTheme,
  saveSiteThemePreference,
  type SiteTheme,
} from '../../../src/site/theme-preference';

const VITEPRESS_APPEARANCE_KEY = 'vitepress-theme-appearance';

function readVitePressAppearance(): SiteTheme | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const appearance = window.localStorage.getItem(VITEPRESS_APPEARANCE_KEY);
  return appearance === 'light' || appearance === 'dark' ? appearance : null;
}

export default {
  extends: DefaultTheme,
  setup() {
    const { isDark } = useData();
    let syncing = false;
    let cleanupListeners: (() => void) | null = null;

    const setDocsTheme = (theme: SiteTheme): void => {
      syncing = true;
      isDark.value = theme === 'dark';
      queueMicrotask(() => {
        syncing = false;
      });
    };

    const syncFromSharedPreference = (): void => {
      const storedSharedPreference = readStoredSiteThemeValue();
      const preference = readSiteThemePreference();
      if (preference === 'light' || preference === 'dark') {
        setDocsTheme(preference);
        return;
      }

      const docsPreference = readVitePressAppearance();
      if (!storedSharedPreference && docsPreference) {
        saveSiteThemePreference(docsPreference);
        setDocsTheme(docsPreference);
        return;
      }

      setDocsTheme(resolveSiteTheme());
    };

    onMounted(() => {
      syncFromSharedPreference();

      const handleStorage = (event: StorageEvent): void => {
        if (event.key && event.key !== UI_SETTINGS_STORAGE_KEY && event.key !== VITEPRESS_APPEARANCE_KEY) {
          return;
        }

        syncFromSharedPreference();
      };

      const handleSharedThemeChange = (): void => {
        syncFromSharedPreference();
      };

      window.addEventListener('storage', handleStorage);
      window.addEventListener(SITE_THEME_CHANGE_EVENT, handleSharedThemeChange);

      cleanupListeners = () => {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener(SITE_THEME_CHANGE_EVENT, handleSharedThemeChange);
      };
    });

    onUnmounted(() => {
      cleanupListeners?.();
      cleanupListeners = null;
    });

    watch(isDark, (nextIsDark) => {
      if (syncing) {
        return;
      }

      saveSiteThemePreference(nextIsDark ? 'dark' : 'light');
    });
  },
} satisfies Theme;

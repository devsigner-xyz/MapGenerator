import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { I18nProvider } from '@/i18n/I18nProvider';
import { UI_SETTINGS_STORAGE_KEY } from '@/nostr/ui-settings';
import LandingPage from './LandingPage';

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

function mockSystemTheme(matches: boolean, reducedMotion = false): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reducedMotion : matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

async function renderLanding(): Promise<RenderResult> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <I18nProvider initialLocale="es">
        <LandingPage />
      </I18nProvider>,
    );
  });

  return { container, root };
}

let mounted: RenderResult[] = [];

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(async () => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  vi.restoreAllMocks();

  for (const entry of mounted) {
    await act(async () => {
      entry.root.unmount();
    });
    entry.container.remove();
  }
  mounted = [];
});

describe('LandingPage theme selector', () => {
  test('uses system dark mode before an explicit selection is stored', async () => {
    mockSystemTheme(true);

    const rendered = await renderLanding();
    mounted.push(rendered);

    const shell = rendered.container.querySelector('.landing-shell');
    const logo = rendered.container.querySelector('.brand-logo') as HTMLImageElement | null;
    const darkButton = rendered.container.querySelector('button[aria-pressed="true"]');

    expect(shell?.getAttribute('data-theme')).toBe('dark');
    expect(logo?.getAttribute('src')).toBe('/logo-v2-dark.png');
    expect(darkButton?.textContent).toContain('Oscuro');
  });

  test('stores explicit light mode for the app when selected from the home', async () => {
    mockSystemTheme(true);
    window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify({ language: 'es', theme: 'dark' }));

    const rendered = await renderLanding();
    mounted.push(rendered);

    const lightButton = Array.from(rendered.container.querySelectorAll('.theme-toggle button')).find((button) =>
      (button.textContent || '').includes('Claro'),
    ) as HTMLButtonElement | undefined;
    expect(lightButton).toBeDefined();

    await act(async () => {
      lightButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const stored = JSON.parse(window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || '{}') as { theme?: string; language?: string };
    const logo = rendered.container.querySelector('.brand-logo') as HTMLImageElement | null;

    expect(stored).toEqual({ language: 'es', theme: 'light' });
    expect(rendered.container.querySelector('.landing-shell')?.getAttribute('data-theme')).toBe('light');
    expect(logo?.getAttribute('src')).toBe('/logo-v2-light.png');
  });

  test('labels the map preview with the active Nostr City preset', async () => {
    mockSystemTheme(false);

    const rendered = await renderLanding();
    mounted.push(rendered);

    const preview = rendered.container.querySelector('[data-testid="landing-map-preview"]');
    expect(preview?.getAttribute('aria-label')).toBe('Vista previa del preset Nostr City Light');
    expect(rendered.container.querySelector('[data-active-preset="Nostr City Light"]')?.textContent).toContain('Nostr City Light');

    const darkButton = Array.from(rendered.container.querySelectorAll('.theme-toggle button')).find((button) =>
      (button.textContent || '').includes('Oscuro'),
    ) as HTMLButtonElement | undefined;
    expect(darkButton).toBeDefined();

    await act(async () => {
      darkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(preview?.getAttribute('aria-label')).toBe('Vista previa del preset Nostr City Dark');
    expect(rendered.container.querySelector('[data-active-preset="Nostr City Dark"]')?.textContent).toContain('Nostr City Dark');
  });

  test('uses native in-page links for section navigation', async () => {
    mockSystemTheme(false, true);

    const rendered = await renderLanding();
    mounted.push(rendered);

    const howLink = rendered.container.querySelector('a[href="#como-funciona"]');
    const featuresLink = rendered.container.querySelector('a[href="#features"]');

    expect(howLink).not.toBeNull();
    expect(featuresLink).not.toBeNull();
    expect(howLink?.textContent).toContain('Ver como funciona');
    expect(featuresLink?.textContent).toContain('Features');
  });
});

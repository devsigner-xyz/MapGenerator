import { useEffect, useState } from 'react';
import { resolvePublicAppUrl } from '@/site/app-url';
import { resolvePublicDocsUrl } from '@/site/docs-url';
import { useI18n } from '@/i18n/useI18n';
import { UI_SETTINGS_STORAGE_KEY } from '@/nostr/ui-settings';
import {
  SITE_THEME_CHANGE_EVENT,
  SITE_THEME_MEDIA_QUERY,
  resolveSiteTheme,
  saveSiteThemePreference,
  type SiteTheme,
} from '@/site/theme-preference';

function scrollToSection(sectionId: string): void {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function LandingPage() {
  const appUrl = resolvePublicAppUrl();
  const docsUrl = resolvePublicDocsUrl();
  const { t } = useI18n();
  const [theme, setTheme] = useState<SiteTheme>(() => resolveSiteTheme());

  useEffect(() => {
    const syncTheme = (event?: Event): void => {
      if (event instanceof StorageEvent && event.key && event.key !== UI_SETTINGS_STORAGE_KEY) {
        return;
      }

      setTheme(resolveSiteTheme());
    };

    window.addEventListener('storage', syncTheme);
    window.addEventListener(SITE_THEME_CHANGE_EVENT, syncTheme);

    const mediaQuery = typeof window.matchMedia === 'function' ? window.matchMedia(SITE_THEME_MEDIA_QUERY) : null;
    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', syncTheme);
      } else {
        mediaQuery.addListener(syncTheme);
      }
    }

    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener(SITE_THEME_CHANGE_EVENT, syncTheme);

      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', syncTheme);
        } else {
          mediaQuery.removeListener(syncTheme);
        }
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;

    const iconHref = theme === 'dark' ? '/icon-dark-32x32.png' : '/icon-light-32x32.png';
    const iconLink = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]') || document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.type = 'image/png';
    iconLink.href = iconHref;
    if (!iconLink.parentElement) {
      document.head.appendChild(iconLink);
    }
  }, [theme]);

  const selectTheme = (nextTheme: SiteTheme): void => {
    setTheme(saveSiteThemePreference(nextTheme));
  };

  const logoSrc = theme === 'dark' ? '/logo-v2-dark.png' : '/logo-v2-light.png';

  return (
    <div className="landing-shell" data-theme={theme}>
      <header className="topbar">
        <a className="brand" href="#hero" aria-label={t('landing.brand.homeAria')}>
          <img className="brand-logo" src={logoSrc} alt={t('landing.brand.logoAlt')} />
          <span>Nostr City</span>
        </a>

        <nav className="topbar-links" aria-label={t('landing.nav.mainLinks')}>
          <a href={docsUrl}>{t('landing.nav.documentation')}</a>
          <a href="https://github.com/ProbableTrain/MapGenerator" target="_blank" rel="noreferrer">
            {t('landing.nav.github')}
          </a>
          <button type="button" onClick={() => scrollToSection('features')}>
            {t('landing.nav.features')}
          </button>
          <div className="theme-toggle" role="group" aria-label={t('landing.theme.label')}>
            <button type="button" aria-pressed={theme === 'light'} onClick={() => selectTheme('light')}>
              {t('landing.theme.light')}
            </button>
            <button type="button" aria-pressed={theme === 'dark'} onClick={() => selectTheme('dark')}>
              {t('landing.theme.dark')}
            </button>
          </div>
          <a className="app-link" href={appUrl}>{t('landing.nav.openApp')}</a>
        </nav>
      </header>

      <main>
        <section className="hero" id="hero">
          <p className="kicker">{t('landing.hero.kicker')}</p>
          <h1>{t('landing.hero.title')}</h1>
          <p>{t('landing.hero.body')}</p>

          <div className="hero-actions">
            <a className="app-link" href={appUrl}>{t('landing.hero.openApp')}</a>
            <button type="button" onClick={() => scrollToSection('como-funciona')}>
              {t('landing.hero.howItWorks')}
            </button>
          </div>

          <div className="hero-grid">
            <article>
              <h3>{t('landing.hero.card.spatial.title')}</h3>
              <p>{t('landing.hero.card.spatial.body')}</p>
            </article>
            <article>
              <h3>{t('landing.hero.card.social.title')}</h3>
              <p>{t('landing.hero.card.social.body')}</p>
            </article>
            <article>
              <h3>{t('landing.hero.card.lab.title')}</h3>
              <p>{t('landing.hero.card.lab.body')}</p>
            </article>
          </div>
        </section>

        <section className="content" id="que-es">
          <h2>{t('landing.whatIs.title')}</h2>
          <p>{t('landing.whatIs.body')}</p>
        </section>

        <section className="content" id="como-funciona">
          <h2>{t('landing.how.title')}</h2>
          <div className="steps">
            <article className="card">
              <h3>{t('landing.how.step1.title')}</h3>
              <p>{t('landing.how.step1.body')}</p>
            </article>
            <article className="card">
              <h3>{t('landing.how.step2.title')}</h3>
              <p>{t('landing.how.step2.body')}</p>
            </article>
            <article className="card">
              <h3>{t('landing.how.step3.title')}</h3>
              <p>{t('landing.how.step3.body')}</p>
            </article>
          </div>
        </section>

        <section className="content" id="features">
          <h2>{t('landing.features.title')}</h2>
          <div className="features">
            <article className="card">
              <h3>{t('landing.features.generativeCity.title')}</h3>
              <p>{t('landing.features.generativeCity.body')}</p>
            </article>
            <article className="card">
              <h3>{t('landing.features.overlay.title')}</h3>
              <p>{t('landing.features.overlay.body')}</p>
            </article>
            <article className="card">
              <h3>{t('landing.features.relays.title')}</h3>
              <p>{t('landing.features.relays.body')}</p>
            </article>
            <article className="card">
              <h3>{t('landing.features.export.title')}</h3>
              <p>{t('landing.features.export.body')}</p>
            </article>
          </div>
        </section>

        <section className="content nostr-native" id="nostr-native">
          <h2>{t('landing.nostrNative.title')}</h2>
          <p>{t('landing.nostrNative.body')}</p>

          <div className="features">
            <article className="card">
              <h3>{t('landing.nostrNative.stack.title')}</h3>
              <p>{t('landing.nostrNative.stack.body')}</p>
            </article>
            <article className="card">
              <h3>{t('landing.nostrNative.protocol.title')}</h3>
              <p>{t('landing.nostrNative.protocol.body')}</p>
            </article>
          </div>
        </section>

        <section className="content" id="filosofia">
          <h2>{t('landing.philosophy.title')}</h2>
          <p>{t('landing.philosophy.body')}</p>

          <p className="manifest">{t('landing.philosophy.manifesto')}</p>

          <div className="footer-cta">
            <a className="app-link" href={appUrl}>{t('landing.footer.openApp')}</a>
            <a href="https://github.com/ProbableTrain/MapGenerator" target="_blank" rel="noreferrer">
              {t('landing.footer.viewRepo')}
            </a>
            <a href={docsUrl}>{t('landing.footer.readDocs')}</a>
          </div>
        </section>
      </main>
    </div>
  );
}

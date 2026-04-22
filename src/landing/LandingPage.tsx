import { resolvePublicAppUrl } from '@/site/app-url';
import { resolvePublicDocsUrl } from '@/site/docs-url';
import { useI18n } from '@/i18n/useI18n';

function scrollToSection(sectionId: string): void {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function LandingPage() {
  const appUrl = resolvePublicAppUrl();
  const docsUrl = resolvePublicDocsUrl();
  const { t } = useI18n();

  return (
    <div className="landing-shell">
      <header className="topbar">
        <p className="brand">Nostr City</p>

        <nav className="topbar-links" aria-label={t('landing.nav.mainLinks')}>
          <a href={docsUrl}>{t('landing.nav.documentation')}</a>
          <a href="https://github.com/ProbableTrain/MapGenerator" target="_blank" rel="noreferrer">
            {t('landing.nav.github')}
          </a>
          <button type="button" onClick={() => scrollToSection('features')}>
            {t('landing.nav.features')}
          </button>
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

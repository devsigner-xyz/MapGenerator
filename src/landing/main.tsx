import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '@/i18n/I18nProvider';
import { loadUiSettings } from '@/nostr/ui-settings';
import LandingPage from './LandingPage';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider initialLocale={loadUiSettings().language}>
      <LandingPage />
    </I18nProvider>
  </StrictMode>,
);

import { describe, expect, it } from 'vitest';
import { resolveLandingAppUrl } from './app-url';

describe('resolveLandingAppUrl', () => {
  it('returns /app/ by default when env is empty', () => {
    expect(resolveLandingAppUrl({})).toBe('/app/');
  });

  it('uses configured VITE_LANDING_APP_URL when provided', () => {
    expect(resolveLandingAppUrl({ VITE_LANDING_APP_URL: 'https://app.loquesea.com' })).toBe('https://app.loquesea.com');
  });
});

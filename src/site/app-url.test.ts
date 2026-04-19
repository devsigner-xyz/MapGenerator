import { describe, expect, it } from 'vitest';
import { resolvePublicAppUrl } from './app-url';

describe('resolvePublicAppUrl', () => {
  it('returns /app/ by default when env is empty', () => {
    expect(resolvePublicAppUrl({})).toBe('/app/');
  });

  it('uses VITE_APP_URL when provided as an absolute URL', () => {
    expect(resolvePublicAppUrl({ VITE_APP_URL: 'http://127.0.0.1:5173/app/' })).toBe(
      'http://127.0.0.1:5173/app/',
    );
  });

  it('normalizes internal paths when provided', () => {
    expect(resolvePublicAppUrl({ VITE_APP_URL: 'app' })).toBe('/app/');
  });
});

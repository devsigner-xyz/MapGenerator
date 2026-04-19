import { describe, expect, it } from 'vitest';
import { resolvePublicDocsUrl } from './docs-url';

describe('resolvePublicDocsUrl', () => {
  it('returns /docs/ by default when env is empty', () => {
    expect(resolvePublicDocsUrl({})).toBe('/docs/');
  });

  it('uses VITE_DOCS_URL when provided as an absolute URL', () => {
    expect(resolvePublicDocsUrl({ VITE_DOCS_URL: 'http://127.0.0.1:5174/docs/' })).toBe(
      'http://127.0.0.1:5174/docs/',
    );
  });

  it('normalizes configured internal paths', () => {
    expect(resolvePublicDocsUrl({ VITE_DOCS_URL: 'docs' })).toBe('/docs/');
  });

  it('uses local VitePress docs server during frontend dev when no explicit URL is provided', () => {
    expect(
      resolvePublicDocsUrl({ DEV: true }, { hostname: '127.0.0.1', port: '5173', protocol: 'http:' }),
    ).toBe('http://127.0.0.1:5174/docs/');
  });
});

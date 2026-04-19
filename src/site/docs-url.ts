interface PublicDocsUrlEnv {
  VITE_DOCS_URL?: string;
  DEV?: boolean;
}

interface PublicLocationLike {
  hostname: string;
  port: string;
  protocol: string;
}

function normalizeInternalPath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  if (withLeadingSlash.includes('?') || withLeadingSlash.includes('#')) {
    return withLeadingSlash;
  }

  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function resolvePublicDocsUrl(
  env: PublicDocsUrlEnv = import.meta.env as PublicDocsUrlEnv,
  location: PublicLocationLike | undefined = typeof window !== 'undefined' ? window.location : undefined,
): string {
  const configured = env.VITE_DOCS_URL?.trim();
  if (!configured) {
    if (env.DEV && location && (location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
      return `${location.protocol}//${location.hostname}:5174/docs/`;
    }

    return '/docs/';
  }

  if (configured.startsWith('https://') || configured.startsWith('http://')) {
    return configured;
  }

  return normalizeInternalPath(configured);
}

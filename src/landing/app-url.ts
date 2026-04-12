interface LandingEnv {
  VITE_LANDING_APP_URL?: string;
}

function normalizeInternalPath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  if (withLeadingSlash.includes('?') || withLeadingSlash.includes('#')) {
    return withLeadingSlash;
  }

  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function resolveLandingAppUrl(env: LandingEnv = import.meta.env as LandingEnv): string {
  const configured = env.VITE_LANDING_APP_URL?.trim();
  if (!configured) {
    return '/app/';
  }

  if (configured.startsWith('https://') || configured.startsWith('http://')) {
    return configured;
  }

  return normalizeInternalPath(configured);
}

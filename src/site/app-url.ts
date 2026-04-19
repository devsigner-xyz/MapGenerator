interface PublicAppUrlEnv {
  VITE_APP_URL?: string;
  VITE_LANDING_APP_URL?: string;
}

function normalizeInternalPath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  if (withLeadingSlash.includes('?') || withLeadingSlash.includes('#')) {
    return withLeadingSlash;
  }

  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function resolvePublicAppUrl(
  env: PublicAppUrlEnv = import.meta.env as PublicAppUrlEnv,
): string {
  const configured = env.VITE_APP_URL?.trim() || env.VITE_LANDING_APP_URL?.trim();
  if (!configured) {
    return '/app/';
  }

  if (configured.startsWith('https://') || configured.startsWith('http://')) {
    return configured;
  }

  return normalizeInternalPath(configured);
}

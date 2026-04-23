export interface ResolveRelaySetsInput {
  scopedRelays?: string[];
  userRelays?: string[];
  bootstrapRelays?: string[];
}

export interface ResolvedRelaySets {
  primary: string[];
  fallback: string[];
  primaryKey: string;
  fallbackKey: string;
}

export const normalizeRelayUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return null;
    }

    parsed.hash = '';
    parsed.search = '';

    const normalized = parsed.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    return null;
  }
};

export const mergeRelaySets = (...relaySets: string[][]): string[] => {
  const merged = new Set<string>();

  for (const relaySet of relaySets) {
    for (const relay of relaySet) {
      const normalized = normalizeRelayUrl(relay);
      if (normalized) {
        merged.add(normalized);
      }
    }
  }

  return [...merged];
};

export const relaySetKey = (relays: string[]): string => {
  const normalized = canonicalRelaySet(relays);
  return normalized.sort().join('|');
};

export const canonicalRelaySet = (...relaySets: string[][]): string[] => {
  return mergeRelaySets(...relaySets).sort((left, right) => left.localeCompare(right));
};

export const resolveRelaySets = ({
  scopedRelays = [],
  userRelays = [],
  bootstrapRelays = [],
}: ResolveRelaySetsInput): ResolvedRelaySets => {
  const candidatePrimary = mergeRelaySets(scopedRelays, userRelays);
  const fallback = mergeRelaySets(bootstrapRelays);

  return {
    primary: candidatePrimary,
    fallback,
    primaryKey: relaySetKey(candidatePrimary),
    fallbackKey: relaySetKey(fallback),
  };
};

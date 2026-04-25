const HEX_64_REGEX = /^[0-9a-f]{64}$/;

const normalizeHex64 = (value: string): string | null => {
  const normalized = value.trim().toLowerCase();
  return HEX_64_REGEX.test(normalized) ? normalized : null;
};

export function normalizeHexPubkey(value: string): string | null {
  return normalizeHex64(value);
}

export function assertHexPubkey(value: string, fieldName = 'pubkey'): string {
  const normalized = normalizeHexPubkey(value);
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}: expected 64 lowercase hex characters`);
  }

  return normalized;
}

export function normalizeHexEventId(value: string): string | null {
  return normalizeHex64(value);
}

export function sanitizeNostrTagValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

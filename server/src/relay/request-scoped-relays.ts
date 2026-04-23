const SCOPED_READ_RELAYS_LIMIT = 12;

export const SCOPED_READ_RELAY_PATTERN = '^wss?:\\/\\/\\S+$';

function isValidScopedReadRelay(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

export function normalizeScopedReadRelaysInput(
  value: string | string[] | undefined,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = [...new Set(
    (Array.isArray(value) ? value : [value])
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .filter(isValidScopedReadRelay),
  )].slice(0, SCOPED_READ_RELAYS_LIMIT);

  return normalized.length > 0 ? normalized : undefined;
}

interface RelayErrorLike {
  code?: string;
  name?: string;
  message?: string;
  recoverable?: boolean;
}

export interface ShouldUseFallbackInput {
  primaryRelays: string[];
  error?: unknown;
}

const RECOVERABLE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
]);

const RECOVERABLE_ERROR_NAMES = new Set(['TimeoutError', 'AbortError']);

export const isRecoverableRelayError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const typed = error as RelayErrorLike;

  if (typed.recoverable === true) {
    return true;
  }

  if (typeof typed.code === 'string' && RECOVERABLE_ERROR_CODES.has(typed.code)) {
    return true;
  }

  if (typeof typed.name === 'string' && RECOVERABLE_ERROR_NAMES.has(typed.name)) {
    return true;
  }

  if (typeof typed.message === 'string') {
    const message = typed.message.toLowerCase();
    if (message.includes('timeout') || message.includes('temporarily unavailable')) {
      return true;
    }
  }

  return false;
};

export const shouldUseFallbackRelays = ({
  primaryRelays,
  error,
}: ShouldUseFallbackInput): boolean => {
  if (primaryRelays.length === 0) {
    return true;
  }

  if (!error) {
    return false;
  }

  return isRecoverableRelayError(error);
};
